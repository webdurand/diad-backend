import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CampaignPlayerEntity } from "src/entities/campaign-player.entity";
import { EncounterService } from "./encounter.service";
import { SessionService } from "./session.service";
import { CampaignService } from "../../world/services/campaign.service";

/**
 * Central permission policy for combat mutations.
 *
 * A mutation on a participant is allowed when the caller is either:
 *   - the owner of the PC (for PC participants), or
 *   - the DM of the campaign that contains the session (for any participant).
 *
 * Returns the `ownerUserId` that downstream services should treat as the
 * authoritative actor (so DM-on-behalf-of-player flows compute the right
 * character sheet). Throws FORBIDDEN when the caller has no claim.
 *
 * This is the single place permission policy lives — controllers and
 * services call `resolveMutationOwner` instead of re-deriving it.
 */
@Injectable()
export class PermissionResolver {
  constructor(
    private readonly encounterService: EncounterService,
    private readonly sessionService: SessionService,
    private readonly campaignService: CampaignService,
    @InjectRepository(CampaignPlayerEntity)
    private readonly campaignPlayerRepo: Repository<CampaignPlayerEntity>,
  ) {}

  async resolveMutationOwner(
    participantId: string,
    authUserId: string,
    encounterId: string,
  ): Promise<string> {
    if (!authUserId) {
      throw new ForbiddenException("Sessao ausente.");
    }

    const participant =
      await this.encounterService.getParticipant(participantId);
    if (participant.encounterId !== encounterId) {
      throw new ForbiddenException(
        "Participante nao pertence a este encontro.",
      );
    }

    const encounter = await this.encounterService.getById(encounterId);
    const session = await this.sessionService.getById(encounter.sessionId);
    const campaignId = session.campaignId ?? undefined;

    const isDm = await this.isCampaignDm(campaignId, authUserId);

    if (participant.type !== "pc" || !participant.characterId) {
      if (isDm) return authUserId;
      throw new ForbiddenException(
        "Apenas o DM pode controlar este participante.",
      );
    }

    const characterOwner = await this.encounterService.resolveCharacterOwner(
      participant.characterId,
      authUserId,
      campaignId,
    );

    if (characterOwner === authUserId) return authUserId;
    if (isDm) return characterOwner;

    throw new ForbiddenException("Voce nao controla este personagem.");
  }

  /**
   * Spec 027 (M2 follow-up) — em DIAD solo a IA é o DM. O `dmUserId` da
   * campanha aponta historicamente pro player (vestígio multiplayer-first),
   * mas isso NÃO deve dar bypass de DM em mutations de combate. Caso
   * contrário o player controla NPCs hostis (bug reportado).
   *
   * Heurística: campanha é "AI-DM solo" quando NÃO há outros usuários
   * cadastrados em `campaign_players` além do próprio dmUserId. Assim que
   * um segundo user humano entra (multiplayer real), o DM volta a ter
   * bypass.
   */
  private async isCampaignDm(
    campaignId: string | undefined,
    userId: string,
  ): Promise<boolean> {
    if (!campaignId) return false;
    try {
      const campaign = await this.campaignService.getById(campaignId);
      if (campaign.dmUserId !== userId) return false;
      // DM bypass só vale em multiplayer real — quando há player não-DM
      // cadastrado. Solo: AI é DM, player não tem DM powers.
      const otherPlayers = await this.campaignPlayerRepo.count({
        where: { campaignId, isActive: true },
      });
      // Se só o próprio user (ou ninguém) está em campaign_players, é solo.
      if (otherPlayers <= 1) return false;
      // Existe outro user cadastrado? Confere distinct user_ids.
      const distinctUsers = await this.campaignPlayerRepo
        .createQueryBuilder("cp")
        .select("COUNT(DISTINCT cp.user_id)", "n")
        .where("cp.campaign_id = :cid", { cid: campaignId })
        .andWhere("cp.is_active = true")
        .getRawOne<{ n: string }>();
      const n = Number(distinctUsers?.n ?? 0);
      // Multi-DM real: ≥ 2 users distintos no campaign_players. Solo: ≤ 1.
      return n >= 2;
    } catch {
      return false;
    }
  }
}
