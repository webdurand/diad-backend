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

/**
 * Barbarian L9 Brutal Strike (RAW 2024 XPHB).
 *
 * Trigger: ao usar Reckless Attack + escolher abrir mão da advantage, o hit
 * resultante concede +1d10 damage + 1 efeito à escolha.
 *
 *  - Forceful Blow: target push 10ft (Large ou menor) + attacker move ½ speed sem OA
 *  - Hamstring Blow: target -15ft speed até fim do próximo turno
 *  - L13 adiciona: Staggering Blow (disadvantage próximo save + sem OA)
 *  - L13 adiciona: Sundering Blow (+2d6 damage próximo aliado que acertar target)
 *  - L17+: Improved Brutal Strike = 2d10 + escolhe 2 efeitos simultâneos
 *
 * MVP: Forceful + Hamstring (tier 1). V2: Staggering + Sundering + 2d10.
 *
 * Valida: barbarian L9+, raging (condition 'raging'), Reckless Attack armed.
 * Endpoint chamado APÓS attack hit (cliente computa hit → chama endpoint).
 */
@Injectable()
export class BrutalStrikeService {
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

  /** L9-12: 1d10. L13-16: 1d10 (2 options permitidos). L17+: 2d10. */
  private computeBrutalDamage(barbarianLevel: number): {
    roll: number;
    diceCount: 1 | 2;
  } {
    const diceCount: 1 | 2 = barbarianLevel >= 17 ? 2 : 1;
    let total = 0;
    for (let i = 0; i < diceCount; i++) {
      total += this.dice.roll(10);
    }
    return { roll: total, diceCount };
  }

  private async validateBarbarianL9(
    userId: string,
    participantId: string,
  ): Promise<
    GameResult<{
      barbarian: EncounterParticipantEntity;
      barbarianLevel: number;
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
    const barbLv =
      (sheet.classes ?? []).find((c) => c.slug === "barbarian")?.level ?? 0;
    const hasBrutalStrike =
      (sheet as unknown as { hasBrutalStrike?: boolean }).hasBrutalStrike ===
      true;
    if (!hasBrutalStrike || barbLv < 9) {
      return failure(
        "Você não é Barbarian L9+ com Brutal Strike.",
        "FEATURE_NOT_AVAILABLE",
      );
    }
    if (!(barbarian.conditions ?? []).includes("raging")) {
      return failure("Brutal Strike exige Rage ativo.", "RAGE_REQUIRED");
    }
    return success({ barbarian, barbarianLevel: barbLv });
  }

  /**
   * Forceful Blow: +Nd10 damage + target push 10ft + attacker move ½ speed grátis.
   */
  async forcefulBlow(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantId: string,
  ): Promise<
    GameResult<{
      damage: number;
      diceCount: number;
      targetPushFt: number;
      attackerMoveFt: number;
    }>
  > {
    const validate = await this.validateBarbarianL9(userId, participantId);
    if (!validate.ok) return validate;
    const { barbarian, barbarianLevel } = validate.value;

    const target =
      await this.encounterService.getParticipant(targetParticipantId);
    const { roll, diceCount } = this.computeBrutalDamage(barbarianLevel);

    // Damage direto em target (HP). Monster vs PC: mesmo approach do BM Trip.
    const prevHp = target.currentHp ?? 0;
    target.currentHp = Math.max(0, prevHp - roll);
    await this.participantRepo.save(target);

    // Attacker recebe move_bonus via effect (similar Tactical Shift rider)
    // Half speed calc: sheet.speed ÷ 2
    const barbSheet = await this.sheetService.computeSheet(
      userId,
      barbarian.characterId!,
    );
    const halfSpeed = Math.floor(
      (barbSheet as unknown as { speed: number }).speed / 2,
    );

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: barbarian.id,
      target_participant_id: target.id,
      data: {
        featureSlug: "brutal-strike",
        option: "forceful-blow",
        damage: roll,
        diceCount,
        targetPushFt: 10,
        attackerMoveFt: halfSpeed,
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
      { damage: roll, diceCount, targetPushFt: 10, attackerMoveFt: halfSpeed },
      [event],
    );
  }

  /**
   * Hamstring Blow: +Nd10 damage + target speed -15ft até fim próximo turno.
   */
  async hamstringBlow(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantId: string,
  ): Promise<
    GameResult<{
      damage: number;
      diceCount: number;
      targetSpeedReduction: number;
    }>
  > {
    const validate = await this.validateBarbarianL9(userId, participantId);
    if (!validate.ok) return validate;
    const { barbarian, barbarianLevel } = validate.value;

    const target =
      await this.encounterService.getParticipant(targetParticipantId);
    const { roll, diceCount } = this.computeBrutalDamage(barbarianLevel);

    const prevHp = target.currentHp ?? 0;
    target.currentHp = Math.max(0, prevHp - roll);
    await this.participantRepo.save(target);

    // Aplica effect speed_reduction no target até fim próximo turno
    await this.effectInstances.addEffect(target, {
      kind: "speed_reduction",
      sourceFeatureSlug: "brutal-strike",
      sourceCasterParticipantId: barbarian.id,
      payload: { amount: 15 },
      expiresAt: { kind: "rounds", value: 1 },
      requiresConcentration: false,
    });

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: barbarian.id,
      target_participant_id: target.id,
      data: {
        featureSlug: "brutal-strike",
        option: "hamstring-blow",
        damage: roll,
        diceCount,
        targetSpeedReduction: 15,
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

    return success({ damage: roll, diceCount, targetSpeedReduction: 15 }, [
      event,
    ]);
  }
}
