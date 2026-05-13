import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { EncounterService } from "./encounter.service";
import { DiceService } from "./dice.service";
import { EventService } from "./event.service";
import { EffectInstanceService } from "./effect-instance.service";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";


@Injectable()
export class PaladinFeaturesService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly encounterService: EncounterService,
    private readonly dice: DiceService,
    private readonly eventService: EventService,
    private readonly effectInstances: EffectInstanceService,
  ) {}


  async divineSmite(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantId: string,
    slotLevel: number,
    hitWasCritical: boolean,
    targetType: "fiend" | "undead" | null,
    freeCast: boolean,
  ): Promise<
    GameResult<{
      damage: number;
      diceCount: number;
      baseDice: number;
      fiendUndeadBonus: boolean;
      critical: boolean;
      slotConsumed: boolean;
      targetPrevHp: number;
      targetNewHp: number;
    }>
  > {
    const paladin = await this.encounterService.getParticipant(participantId);
    if (paladin.type !== "pc" || !paladin.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      paladin.characterId,
    );
    const hasSmite =
      (sheet as unknown as { hasDivineSmite?: boolean }).hasDivineSmite ===
      true;
    const paladinLv =
      (sheet.classes ?? []).find((c) => c.slug === "paladin")?.level ?? 0;
    if (!hasSmite || paladinLv < 1) {
      return failure(
        "Requer Paladin L1+ com Divine Smite.",
        "FEATURE_NOT_AVAILABLE",
      );
    }


    if (freeCast) {
      const hasFreeSmite =
        (sheet as unknown as { hasPaladinsSmite?: boolean })
          .hasPaladinsSmite === true;
      if (!hasFreeSmite || paladinLv < 2) {
        return failure(
          "Requer Paladin L2+ com Paladin's Smite pra free cast.",
          "FEATURE_NOT_AVAILABLE",
        );
      }
    } else {
      if (slotLevel < 1 || slotLevel > 9) {
        return failure("slotLevel inválido (1-9).", "INVALID_SLOT");
      }
    }



    const effectiveSlot = freeCast ? 1 : Math.min(slotLevel, 4);
    const baseDice = 2 + (effectiveSlot - 1);
    const fiendUndeadBonus = targetType === "fiend" || targetType === "undead";
    const bonusDice = fiendUndeadBonus ? 1 : 0;
    let totalDice = baseDice + bonusDice;
    if (hitWasCritical) totalDice *= 2;

    let damage = 0;
    for (let i = 0; i < totalDice; i++) damage += this.dice.roll(8);

    const target =
      await this.encounterService.getParticipant(targetParticipantId);
    const prevHp = target.currentHp ?? 0;
    target.currentHp = Math.max(0, prevHp - damage);
    await this.participantRepo.save(target);




    const slotConsumed = !freeCast;

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: paladin.id,
      target_participant_id: target.id,
      data: {
        featureSlug: "divine-smite",
        damage,
        diceCount: totalDice,
        baseDice,
        bonusDice,
        fiendUndeadBonus,
        critical: hitWasCritical,
        slotLevel: freeCast ? 0 : slotLevel,
        freeCast,
        slotConsumed,
        targetPrevHp: prevHp,
        targetNewHp: target.currentHp,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }

    return success(
      {
        damage,
        diceCount: totalDice,
        baseDice,
        fiendUndeadBonus,
        critical: hitWasCritical,
        slotConsumed,
        targetPrevHp: prevHp,
        targetNewHp: target.currentHp,
      },
      [event],
    );
  }


  async radiantStrikes(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantId: string,
  ): Promise<
    GameResult<{
      damage: number;
      targetPrevHp: number;
      targetNewHp: number;
    }>
  > {
    const paladin = await this.encounterService.getParticipant(participantId);
    if (paladin.type !== "pc" || !paladin.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      paladin.characterId,
    );
    const hasRS =
      (sheet as unknown as { hasRadiantStrikes?: boolean })
        .hasRadiantStrikes === true;
    const paladinLv =
      (sheet.classes ?? []).find((c) => c.slug === "paladin")?.level ?? 0;
    if (!hasRS || paladinLv < 11) {
      return failure(
        "Requer Paladin L11+ com Radiant Strikes.",
        "FEATURE_NOT_AVAILABLE",
      );
    }

    const damage = this.dice.roll(8);
    const target =
      await this.encounterService.getParticipant(targetParticipantId);
    const prevHp = target.currentHp ?? 0;
    target.currentHp = Math.max(0, prevHp - damage);
    await this.participantRepo.save(target);

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: paladin.id,
      target_participant_id: target.id,
      data: {
        featureSlug: "radiant-strikes",
        damage,
        targetPrevHp: prevHp,
        targetNewHp: target.currentHp,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }
    return success(
      { damage, targetPrevHp: prevHp, targetNewHp: target.currentHp },
      [event],
    );
  }


  async sacredWeapon(
    userId: string,
    encounterId: string,
    participantId: string,
  ): Promise<
    GameResult<{
      chaBonus: number;
      durationRounds: number;
      armed: boolean;
    }>
  > {
    const paladin = await this.encounterService.getParticipant(participantId);
    if (paladin.type !== "pc" || !paladin.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      paladin.characterId,
    );
    const hasSW =
      (sheet as unknown as { hasSacredWeapon?: boolean }).hasSacredWeapon ===
      true;
    if (!hasSW) {
      return failure(
        "Requer Paladin Devotion L3+ com Sacred Weapon.",
        "FEATURE_NOT_AVAILABLE",
      );
    }
    const chaAbility = sheet.abilityScores.find((a) => a.slug === "cha");
    const chaBonus = chaAbility?.modifier ?? 0;


    await this.effectInstances.addEffect(paladin, {
      kind: "damage_bonus",
      sourceFeatureSlug: "sacred-weapon",
      sourceCasterParticipantId: paladin.id,
      payload: { amount: chaBonus, scope: "melee" },
      expiresAt: { kind: "rounds", value: 10 },
      requiresConcentration: false,
    });

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: paladin.id,
      data: {
        featureSlug: "sacred-weapon",
        chaBonus,
        durationRounds: 10,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }
    return success({ chaBonus, durationRounds: 10, armed: true }, [event]);
  }
}
