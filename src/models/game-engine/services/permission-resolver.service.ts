import { ForbiddenException, Injectable } from "@nestjs/common";
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
