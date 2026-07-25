import { Injectable, Logger } from "@nestjs/common";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import { canTakeReactionFromConditions } from "./condition-effects.service";


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
    if (!canTakeReactionFromConditions(target.conditions)) return null;
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

  async shouldOfferDeflectAttacks(
    target: EncounterParticipantEntity,
    damageType: string,
    ownerUserId: string,
  ): Promise<{
    reactorName: string;
    dexterityModifier: number;
    monkLevel: number;
    focusRemaining: number;
  } | null> {
    if (target.type !== "pc" || !target.characterId) return null;
    if ((target.reactionsUsed ?? 0) > 0) return null;
    if (!canTakeReactionFromConditions(target.conditions)) return null;
    if (target.dyingState === "dying" || target.dyingState === "dead") {
      return null;
    }
    if (
      !["bludgeoning", "piercing", "slashing"].includes(
        damageType.trim().toLowerCase(),
      )
    ) {
      return null;
    }

    let sheet: Awaited<ReturnType<CharacterSheetService["computeSheet"]>>;
    try {
      sheet = await this.sheetService.computeSheet(
        ownerUserId,
        target.characterId,
      );
    } catch (err) {
      this.logger.debug(
        `[shouldOfferDeflectAttacks] sheet fetch fail: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }

    const monkLevel =
      sheet.classes.find((entry) => entry.slug.startsWith("monk"))?.level ?? 0;
    const hasFeature = (
      (
        sheet as unknown as {
          features?: Array<{ slug?: string; active?: boolean }>;
        }
      ).features ?? []
    ).some(
      (feature) =>
        feature.active !== false &&
        feature.slug?.startsWith("deflect-attacks"),
    );
    if (monkLevel < 3 || !hasFeature) return null;

    const dexterityModifier =
      sheet.abilityScores.find((score) => score.slug === "dex")?.modifier ?? 0;
    const focusRemaining = Math.max(
      0,
      (sheet.kiPoints?.total ?? monkLevel) - (sheet.kiPoints?.used ?? 0),
    );
    return {
      reactorName: target.displayName,
      dexterityModifier,
      monkLevel,
      focusRemaining,
    };
  }

  async shouldOfferUncannyDodge(
    target: EncounterParticipantEntity,
    ownerUserId: string,
  ): Promise<{ reactorName: string; rogueLevel: number } | null> {
    if (target.type !== "pc" || !target.characterId) return null;
    if ((target.reactionsUsed ?? 0) > 0) return null;
    if (!canTakeReactionFromConditions(target.conditions)) return null;
    if (target.dyingState === "dying" || target.dyingState === "dead") {
      return null;
    }

    let sheet: Awaited<ReturnType<CharacterSheetService["computeSheet"]>>;
    try {
      sheet = await this.sheetService.computeSheet(
        ownerUserId,
        target.characterId,
      );
    } catch (err) {
      this.logger.debug(
        `[shouldOfferUncannyDodge] sheet fetch fail: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }

    const rogueLevel =
      sheet.classes.find((entry) => entry.slug.startsWith("rogue"))?.level ?? 0;
    const hasFeature = (
      (
        sheet as unknown as {
          features?: Array<{ slug?: string; active?: boolean }>;
        }
      ).features ?? []
    ).some(
      (feature) =>
        feature.active !== false &&
        feature.slug?.startsWith("uncanny-dodge"),
    );
    if (rogueLevel < 5 || !hasFeature) return null;

    return { reactorName: target.displayName, rogueLevel };
  }
}
