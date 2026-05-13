import { Injectable, Logger } from "@nestjs/common";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { CharacterStateService } from "src/models/characters/services/character-state.service";


@Injectable()
export class ReactionOpportunityService {
  private readonly logger = new Logger(ReactionOpportunityService.name);

  constructor(
    private readonly sheetService: CharacterSheetService,
    private readonly stateService: CharacterStateService,
  ) {}


  async shouldOfferShield(
    target: EncounterParticipantEntity,
    attackTotal: number,
    targetAc: number,
    ownerUserId: string,
  ): Promise<{ slotLevel: number; reactorName: string } | null> {
    if (target.type !== "pc" || !target.characterId) return null;
    if ((target.reactionsUsed ?? 0) > 0) return null;
    if ((target.currentHp ?? 0) <= 0) return null;

    if (attackTotal >= targetAc + 5) return null;

    let sheet: Awaited<ReturnType<CharacterSheetService["computeSheet"]>>;
    try {
      sheet = await this.sheetService.computeSheet(
        ownerUserId,
        target.characterId,
      );
    } catch (err) {
      this.logger.debug(
        `[shouldOfferShield] sheet fetch fail: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }


    const shieldSpell = (sheet.spells ?? []).find((s) => {
      const slugNorm = s.slug.replace(/-(phb|xphb|tce|xge|fttod)$/, "");
      return (
        slugNorm === "shield" && (s.status === "prepared" || s.alwaysPrepared)
      );
    });
    if (!shieldSpell) return null;


    const slot = (sheet.spellSlots ?? []).find(
      (s) => s.level >= 1 && s.total - s.used > 0,
    );
    if (!slot) return null;

    return {
      slotLevel: slot.level,
      reactorName: target.displayName,
    };
  }
}
