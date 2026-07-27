import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CampaignPlayerEntity } from "src/entities/campaign-player.entity";
import { EncounterService } from "./encounter.service";
import { SessionService } from "./session.service";
import { CampaignService } from "../../world/services/campaign.service";


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

    const sessionId = await this.encounterService.getSessionIdFor(encounterId);
    const campaignId =
      (await this.sessionService.getCampaignIdOf(sessionId)) ?? undefined;

    const isDm = await this.isCampaignDm(campaignId, authUserId);

    if (participant.type !== "pc" || !participant.characterId) {
      if (
        participant.controlledBy === "pc" &&
        participant.linkedCasterParticipantId
      ) {
        const summonOwner = await this.resolveLinkedCasterOwner(
          participant.linkedCasterParticipantId,
          authUserId,
          campaignId,
        );
        if (summonOwner === authUserId) return summonOwner;
        if (isDm) return summonOwner;
      }
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

  private async resolveLinkedCasterOwner(
    casterParticipantId: string,
    authUserId: string,
    campaignId: string | undefined,
  ): Promise<string> {
    const caster = await this.encounterService.getParticipant(
      casterParticipantId,
    );
    if (caster.type !== "pc" || !caster.characterId) {
      throw new ForbiddenException(
        "Invocacao sem conjurador controlavel pelo jogador.",
      );
    }
    return this.encounterService.resolveCharacterOwner(
      caster.characterId,
      authUserId,
      campaignId,
    );
  }


  private async isCampaignDm(
    campaignId: string | undefined,
    userId: string,
  ): Promise<boolean> {
    if (!campaignId) return false;
    try {
      const campaign = await this.campaignService.getById(campaignId);
      return campaign.dmUserId === userId;
    } catch {
      return false;
    }
  }
}
