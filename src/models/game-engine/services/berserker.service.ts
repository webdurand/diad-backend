import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { EncounterService } from "./encounter.service";
import { DiceService } from "./dice.service";
import { EventService } from "./event.service";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { EffectInstanceService } from "./effect-instance.service";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";

/**
 * Barbarian Path of the Berserker (RAW 2024 XPHB):
 *  - L3 Frenzy: Reckless+Rage primeiro hit no turno → +Nd6 bonus damage.
 *    N = rage damage tier (2 em L1-8, 3 em L9-15, 4 em L16+).
 *  - L6 Mindless Rage: sheet flag — bloqueado em condition apply quando raging.
 *  - L10 Retaliation (RAW 2024 — corrigido L14→L10 via migration): reaction
 *    quando tomar dano de criatura adjacente 5ft → melee attack contra ela.
 *  - L14 Intimidating Presence (RAW 2024): Bonus action, 30ft emanation, cada
 *    criatura escolhida faz WIS save DC 8+STR+PB. Falha = Frightened 1min.
 *    Recarrega com 1 uso de Rage.
 */
@Injectable()
export class BerserkerService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly encounterService: EncounterService,
    private readonly dice: DiceService,
    private readonly eventService: EventService,
    private readonly conditionLifecycle: ConditionLifecycleService,
    private readonly effectInstances: EffectInstanceService,
  ) {}

  /** Rage damage tier → N dos d6 de Frenzy. */
  private frenzyDiceCount(barbarianLevel: number): number {
    if (barbarianLevel >= 16) return 4;
    if (barbarianLevel >= 9) return 3;
    return 2;
  }

  /**
   * Frenzy (RAW 2024): ao usar Reckless Attack em Rage, primeiro hit do turno
   * ganha +Nd6 bonus damage. 1/turn. Endpoint chamado após hit confirmado.
   */
  async frenzy(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantId: string,
  ): Promise<
    GameResult<{
      damage: number;
      diceCount: number;
      targetPrevHp: number;
      targetNewHp: number;
    }>
  > {
    const barbarian = await this.encounterService.getParticipant(participantId);
    if (barbarian.type !== "pc" || !barbarian.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      barbarian.characterId,
    );
    const hasFrenzy =
      (sheet as unknown as { hasFrenzy?: boolean }).hasFrenzy === true;
    if (!hasFrenzy) {
      return failure("Você não é Berserker L3+.", "FEATURE_NOT_AVAILABLE");
    }
    if (!(barbarian.conditions ?? []).includes("raging")) {
      return failure("Frenzy exige Rage ativo.", "RAGE_REQUIRED");
    }
    const barbLv =
      (sheet.classes ?? []).find((c) => c.slug === "barbarian")?.level ?? 0;
    const diceCount = this.frenzyDiceCount(barbLv);
    let damage = 0;
    for (let i = 0; i < diceCount; i++) {
      damage += this.dice.roll(6);
    }

    const target =
      await this.encounterService.getParticipant(targetParticipantId);
    const prevHp = target.currentHp ?? 0;
    target.currentHp = Math.max(0, prevHp - damage);
    await this.participantRepo.save(target);

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: barbarian.id,
      target_participant_id: target.id,
      data: {
        featureSlug: "frenzy",
        damage,
        diceCount,
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
        diceCount,
        targetPrevHp: prevHp,
        targetNewHp: target.currentHp,
      },
      [event],
    );
  }

  /**
   * Retaliation (RAW 2024 L10, corrigido L14→L10): reaction ao tomar dano de
   * criatura adjacente 5ft. Faz 1 melee attack grátis contra ela.
   *
   * MVP: recebe targetParticipantId, rola attack (1d20 + STR + PB), on hit aplica
   * damage via weapon default (1d6+STR). V2: usa weapon empunhada real.
   */
  async retaliation(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantId: string,
  ): Promise<
    GameResult<{
      attackRoll: number;
      attackTotal: number;
      targetAc: number;
      hit: boolean;
      damage?: number;
      targetPrevHp?: number;
      targetNewHp?: number;
    }>
  > {
    const barbarian = await this.encounterService.getParticipant(participantId);
    if (barbarian.type !== "pc" || !barbarian.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      barbarian.characterId,
    );
    const hasRetaliation =
      (sheet as unknown as { hasRetaliation?: boolean }).hasRetaliation ===
      true;
    if (!hasRetaliation) {
      return failure(
        "Requer Berserker L10+ com Retaliation.",
        "FEATURE_NOT_AVAILABLE",
      );
    }
    if ((barbarian.reactionsUsed ?? 0) >= 1) {
      return failure(
        "Sem reactions disponíveis este turno.",
        "NO_REACTIONS_REMAINING",
      );
    }

    const strAbility = sheet.abilityScores.find((a) => a.slug === "str");
    const strMod = strAbility?.modifier ?? 0;
    const pb = sheet.proficiencyBonus ?? 2;

    const attackRoll = this.dice.roll(20);
    const attackTotal = attackRoll + strMod + pb;

    const target =
      await this.encounterService.getParticipant(targetParticipantId);
    const targetAc = this.getTargetAc(target);
    const hit = attackTotal >= targetAc;

    let damage: number | undefined;
    let prevHp: number | undefined;
    let newHp: number | undefined;
    if (hit) {
      // MVP: 1d8 + STR (unarmed barbarian-typical, weapon real em V2)
      damage = this.dice.roll(8) + strMod;
      prevHp = target.currentHp ?? 0;
      target.currentHp = Math.max(0, prevHp - damage);
      await this.participantRepo.save(target);
      newHp = target.currentHp;
    }

    barbarian.reactionsUsed = (barbarian.reactionsUsed ?? 0) + 1;
    await this.participantRepo.save(barbarian);

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: barbarian.id,
      target_participant_id: target.id,
      data: {
        featureSlug: "retaliation",
        attackRoll,
        attackTotal,
        targetAc,
        hit,
        damage: damage ?? null,
        targetPrevHp: prevHp ?? null,
        targetNewHp: newHp ?? null,
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
        attackRoll,
        attackTotal,
        targetAc,
        hit,
        damage,
        targetPrevHp: prevHp,
        targetNewHp: newHp,
      },
      [event],
    );
  }

  /**
   * Intimidating Presence (RAW 2024 L14, corrigido L10→L14): Bonus action,
   * emanação 30ft, cada criatura escolhida faz WIS save DC 8+STR+PB. Falha =
   * Frightened 1min. Recarrega com 1 uso de Rage.
   *
   * MVP: aceita lista targetParticipantIds, aplica save pra cada.
   */
  async intimidatingPresence(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantIds: string[],
  ): Promise<
    GameResult<{
      saveDc: number;
      results: Array<{
        targetParticipantId: string;
        saveRoll: number;
        saveTotal: number;
        passed: boolean;
        frightenedApplied: boolean;
      }>;
    }>
  > {
    const barbarian = await this.encounterService.getParticipant(participantId);
    if (barbarian.type !== "pc" || !barbarian.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      barbarian.characterId,
    );
    const hasIP =
      (sheet as unknown as { hasIntimidatingPresence?: boolean })
        .hasIntimidatingPresence === true;
    if (!hasIP) {
      return failure(
        "Requer Berserker L14+ com Intimidating Presence.",
        "FEATURE_NOT_AVAILABLE",
      );
    }

    const strAbility = sheet.abilityScores.find((a) => a.slug === "str");
    const strMod = strAbility?.modifier ?? 0;
    const pb = sheet.proficiencyBonus ?? 2;
    const saveDc = 8 + strMod + pb;

    const results: Array<{
      targetParticipantId: string;
      saveRoll: number;
      saveTotal: number;
      passed: boolean;
      frightenedApplied: boolean;
    }> = [];

    for (const tid of targetParticipantIds) {
      const target = await this.encounterService.getParticipant(tid);
      const wisMod = this.getSaveModifier(target, "wis");
      const saveRoll = this.dice.roll(20);
      const saveTotal = saveRoll + wisMod;
      const passed = saveTotal >= saveDc;
      let applied = false;
      if (!passed) {
        await this.conditionLifecycle.applyCondition(target, {
          slug: "frightened",
          appliedBy: barbarian.id,
          sourceSpell: "intimidating-presence",
          saveAbility: "wis",
          saveDc,
          repeatSaveTiming: "end_of_turn",
          durationRoundsRemaining: 10, // 1 min
        });
        applied = true;
      }
      results.push({
        targetParticipantId: tid,
        saveRoll,
        saveTotal,
        passed,
        frightenedApplied: applied,
      });
    }

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: barbarian.id,
      data: {
        featureSlug: "intimidating-presence",
        saveDc,
        results,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }
    return success({ saveDc, results }, [event]);
  }

  private getTargetAc(p: EncounterParticipantEntity): number {
    if (
      p.type === "monster" &&
      (p as unknown as { monster?: { armor_class?: Array<{ value: number }> } })
        .monster?.armor_class?.[0]
    ) {
      return (
        p as unknown as { monster: { armor_class: Array<{ value: number }> } }
      ).monster.armor_class[0].value;
    }
    return 10;
  }

  private getSaveModifier(
    p: EncounterParticipantEntity,
    abilitySlug: string,
  ): number {
    if (
      p.type === "monster" &&
      (p as unknown as { monster?: { saving_throws?: Record<string, number> } })
        .monster?.saving_throws
    ) {
      return (
        (p as unknown as { monster: { saving_throws: Record<string, number> } })
          .monster.saving_throws[abilitySlug] ?? 0
      );
    }
    return 0;
  }
}
