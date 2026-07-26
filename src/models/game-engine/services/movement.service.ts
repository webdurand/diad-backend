import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import {
  ConditionEffectsService,
  canMoveFromConditions,
  canTakeReactionFromConditions,
} from "./condition-effects.service";
import { ActionsService } from "src/models/characters/services/actions.service";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import { EncounterService } from "./encounter.service";
import { PersistentAreaService } from "./persistent-area.service";
import { ExhaustionService } from "./exhaustion.service";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { ConcentrationService } from "./concentration.service";
import { findWitchBoltTether, witchBoltDistanceFt } from "./witch-bolt";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import {
  movementCellCostFt,
  standingMovementCost,
} from "./prone-movement";
import { getMonsterSavingThrowBonus } from "./monster-saving-throw";
import type { SaveAbility } from "../interfaces/combat.interfaces";
import { findFearCompulsion } from "./fear-compulsion";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";
import { getSummonStatBlock } from "./summon-stat-block";
import {
  abjureFoesChoiceError,
  chooseAbjureFoesTurnOption,
} from "./abjure-foes";
import {
  hasFreedomOfMovement,
  isFreedomOfMovementEffect,
  isMagicalSpeedReduction,
} from "./freedom-of-movement";

export interface MovementResult {
  participantId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  distanceFt: number;
  remainingMovement: number;

  opportunityAttacks: Array<{
    attackerParticipantId: string;
    attackerName: string;
  }>;
  readyActions: Array<{
    reactorParticipantId: string;
    reactorName: string;
    actionName: string;
  }>;
}

export interface MovementState {
  speed: number;
  swimSpeed?: number;
  remainingMovement: number;
  hasDashed: boolean;
  hasDisengaged: boolean;
  actionUsed: boolean;
  bonusActionUsed: boolean;
}

export function applyEffectSpeedModifiers(
  baseSpeed: number,
  effects: EncounterParticipantEntity["effectInstances"],
): number {
  const activeEffects = effects ?? [];
  const protectedByFreedom = activeEffects.some(isFreedomOfMovementEffect);
  const flightSpeed = activeEffects
    .filter((effect) => effect.kind === "flight_speed")
    .reduce(
      (highest, effect) =>
        Math.max(
          highest,
          (effect.payload as { amount?: number } | undefined)?.amount ?? 0,
        ),
      0,
    );
  const multiplier = activeEffects
    .filter((effect) => effect.kind === "speed_multiplier")
    .reduce(
      (product, effect) =>
        product *
        ((effect.payload as { amount?: number } | undefined)?.amount ?? 1),
      1,
    );
  const reduction = activeEffects
    .filter(
      (effect) =>
        effect.kind === "speed_reduction" &&
        !(protectedByFreedom && isMagicalSpeedReduction(effect)),
    )
    .reduce(
      (sum, effect) =>
        sum +
        ((effect.payload as { amount?: number } | undefined)?.amount ?? 0),
      0,
    );
  const bonus = activeEffects
    .filter((effect) => effect.kind === "speed_bonus")
    .reduce(
      (sum, effect) =>
        sum +
        ((effect.payload as { amount?: number } | undefined)?.amount ?? 0),
      0,
    );

  return Math.max(
    0,
    (Math.max(baseSpeed, flightSpeed) + bonus) * multiplier - reduction,
  );
}

export function reconcileRemainingMovement(
  currentRemaining: number | null | undefined,
  previousSpeed: number,
  newSpeed: number,
): number {
  return Math.max(
    0,
    (currentRemaining ?? previousSpeed) + (newSpeed - previousSpeed),
  );
}

export function canIgnoreDifficultTerrain(
  participant: Pick<EncounterParticipantEntity, "effectInstances">,
  hasLandsStride: boolean,
): boolean {
  return hasLandsStride || hasFreedomOfMovement(participant);
}

export function getFreedomSwimSpeed(
  speed: number,
  participant: Pick<EncounterParticipantEntity, "effectInstances">,
): number | null {
  return hasFreedomOfMovement(participant) ? speed : null;
}

@Injectable()
export class MovementService {
  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly encounterService: EncounterService,
    private readonly actionsService: ActionsService,
    private readonly sheetService: CharacterSheetService,
    private readonly stateService: CharacterStateService,
    private readonly persistentArea: PersistentAreaService,
    private readonly exhaustion: ExhaustionService,
    private readonly logger: DiadLogger,
    private readonly concentration: ConcentrationService,
    private readonly conditionLifecycle: ConditionLifecycleService,
    private readonly conditionEffects: ConditionEffectsService,
  ) {
    this.logger.setContext(MovementService.name);
  }


  async getSpeed(
    participant: EncounterParticipantEntity,
    ownerUserId?: string,
  ): Promise<number> {
    if (!canMoveFromConditions(participant.conditions)) return 0;
    return this.getBaseSpeed(participant, ownerUserId);
  }

  async getBaseSpeed(
    participant: EncounterParticipantEntity,
    ownerUserId?: string,
  ): Promise<number> {
    let baseSpeed = 30;
    const summonStatBlock = getSummonStatBlock(participant);
    const transformedWalk = participant.transformationState?.form?.speed?.walk;
    if (summonStatBlock) {
      baseSpeed = summonStatBlock.speed;
    } else if (typeof transformedWalk === "number") {
      baseSpeed = transformedWalk;
    } else if (typeof transformedWalk === "string") {
      const parsed = Number.parseInt(transformedWalk, 10);
      baseSpeed = Number.isFinite(parsed) ? parsed : 30;
    } else if (
      participant.type === "pc" &&
      participant.characterId &&
      ownerUserId
    ) {
      try {
        const actions = await this.actionsService.getActions(
          ownerUserId,
          participant.characterId,
        );
        baseSpeed = actions.movement?.speed ?? 30;
      } catch {
        baseSpeed = 30;
      }
    } else if (
      (participant.type === "monster" || participant.type === "npc") &&
      participant.monster
    ) {
      baseSpeed = this.parseMonsterSpeed(participant.monster.speed);
    }


    let exhaustionSpeedPenalty = 0;
    if (participant.type === "pc" && participant.characterId && ownerUserId) {
      try {
        const sheet = await this.sheetService.computeSheet(
          ownerUserId,
          participant.characterId,
        );
        const exhLevel =
          (sheet as { exhaustionLevel?: number }).exhaustionLevel ?? 0;
        if (exhLevel > 0) {
          const mods = this.exhaustion.getModifiers(
            exhLevel,
            "2024_ten_levels",
          );

          exhaustionSpeedPenalty = -(mods.speedPenaltyFt ?? 0);
        }
      } catch {

      }
    }

    return Math.max(
      0,
      applyEffectSpeedModifiers(baseSpeed, participant.effectInstances) -
        exhaustionSpeedPenalty,
    );
  }


  private parseMonsterSpeed(speed: Record<string, unknown>): number {
    if (!speed) return 30;
    const speeds = Object.values(speed)
      .map((value) => {
        if (typeof value === "number") return value;
        if (typeof value !== "string") return 0;
        const match = value.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((value) => value > 0);
    return speeds.length > 0 ? Math.max(...speeds) : 30;
  }

  async getMovementState(
    encounterId: string,
    participantId: string,
    ownerUserId?: string,
  ): Promise<GameResult<MovementState>> {
    const participant =
      await this.encounterService.getParticipant(participantId);
    const speed = await this.getSpeed(participant, ownerUserId);
    const canMove = canMoveFromConditions(participant.conditions);

    const swimSpeed = getFreedomSwimSpeed(speed, participant);
    return success({
      speed,
      ...(swimSpeed != null ? { swimSpeed } : {}),
      remainingMovement: canMove
        ? (participant.movementRemaining ?? speed)
        : 0,
      hasDashed: participant.hasDashed,
      hasDisengaged: participant.hasDisengaged,
      actionUsed: participant.actionUsed,
      bonusActionUsed: participant.bonusActionUsed,
    });
  }


  async moveParticipant(
    encounterId: string,
    participantId: string,
    targetX: number,
    targetY: number,
    ownerUserId?: string,
  ): Promise<GameResult<MovementResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active")
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");


    const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
    if (currentPid !== participantId)
      return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");

    const participant =
      await this.encounterService.getParticipant(participantId);
    if (participant.isDefeated)
      return failure("Participante derrotado.", "CONDITION_PREVENTS_ACTION");
    if (
      participant.type === "pc" &&
      participant.dyingState !== "none"
    ) {
      return failure(
        "Personagem incapacitado não pode se mover.",
        "CONDITION_PREVENTS_ACTION",
      );
    }
    if (!canMoveFromConditions(participant.conditions)) {
      const blockingCondition = (participant.conditions ?? []).find(
        (condition) =>
          [
            "grappled",
            "restrained",
            "stunned",
            "paralyzed",
            "petrified",
            "unconscious",
          ].includes(condition),
      );
      return failure(
        `${blockingCondition ?? "Uma condição"} reduz a velocidade a 0.`,
        "CONDITION_PREVENTS_ACTION",
      );
    }

    const fromX = participant.positionX ?? 0;
    const fromY = participant.positionY ?? 0;

    const fearCompulsion = findFearCompulsion(participant);
    if (fearCompulsion?.appliedBy) {
      const fearSource = await this.participantRepo.findOne({
        where: { id: fearCompulsion.appliedBy },
      });
      if (fearSource?.positionX != null && fearSource.positionY != null) {
        const before = Math.hypot(
          fromX - fearSource.positionX,
          fromY - fearSource.positionY,
        );
        const after = Math.hypot(
          targetX - fearSource.positionX,
          targetY - fearSource.positionY,
        );
        if (after <= before) {
          return failure(
            "Fear obriga a criatura a se afastar do conjurador pela rota disponível.",
            "CONDITION_PREVENTS_ACTION",
          );
        }
      }
    }

    const gridCols =
      encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
    const gridRows =
      encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
    if (
      targetX < 0 ||
      targetX >= gridCols ||
      targetY < 0 ||
      targetY >= gridRows
    )
      return failure(
        "Posicao fora dos limites do grid.",
        "POSITION_OUT_OF_BOUNDS",
      );


    const occupant = await this.participantRepo
      .createQueryBuilder("p")
      .where("p.encounter_id = :encounterId", { encounterId })
      .andWhere("p.position_x = :x", { x: targetX })
      .andWhere("p.position_y = :y", { y: targetY })
      .andWhere("p.is_defeated = false")
      .andWhere("p.id != :pid", { pid: participantId })
      .getOne();
    if (occupant)
      return failure(
        `Posicao ocupada por ${occupant.displayName}.`,
        "POSITION_OCCUPIED",
      );





    const staticDifficult = new Set(
      (encounter.mapData?.difficultTerrainCells ?? []).map(
        (c) => `${c.x},${c.y}`,
      ),
    );
    const tileOverlay =
      await this.persistentArea.getDifficultTerrainOverlay(encounterId);
    const difficultCells = new Set(staticDifficult);
    for (const key of tileOverlay.keys()) difficultCells.add(key);
    let hasLandsStride = false;
    if (participant.type === "pc" && participant.characterId && ownerUserId) {
      try {
        const sheet = await this.sheetService.computeSheet(
          ownerUserId,
          participant.characterId,
        );
        hasLandsStride = !!(sheet as { hasLandsStride?: boolean })
          .hasLandsStride;
      } catch {

      }
    }
    const protectedByFreedom = hasFreedomOfMovement(participant);
    const ignoresDifficultTerrain = canIgnoreDifficultTerrain(
      participant,
      hasLandsStride,
    );





    const distanceCells = Math.max(
      Math.abs(targetX - fromX),
      Math.abs(targetY - fromY),
    );
    const isProne = (participant.conditions ?? []).includes("prone");
    const {
      costFt: distanceFt,
      difficultCellsCrossed,
      traversedCells,
    } = this.computeMoveCost(
      fromX,
      fromY,
      targetX,
      targetY,
      difficultCells,
      ignoresDifficultTerrain,
      isProne,
    );


    const speed = await this.getSpeed(participant, ownerUserId);
    if (participant.movementRemaining == null) {
      participant.movementRemaining = speed;
    }

    if (distanceFt > participant.movementRemaining)
      return failure(
        `Movimento insuficiente: precisa ${distanceFt}ft, tem ${participant.movementRemaining}ft.`,
        "OUT_OF_RANGE",
      );

    const abjureChoice = chooseAbjureFoesTurnOption(
      participant,
      "movement",
      `${encounter.currentRound}:${encounter.currentTurnIndex}`,
    );
    if (!abjureChoice.allowed) {
      return failure(
        abjureFoesChoiceError(abjureChoice.currentChoice),
        "CONDITION_PREVENTS_ACTION",
      );
    }

    const opportunityAttacks =
      participant.hasDisengaged ||
      getSummonStatBlock(participant)?.traits.flyby === true
      ? []
      : await this.checkOpportunityAttacks(
          participant,
          fromX,
          fromY,
          targetX,
          targetY,
          encounterId,
        );
    let readyActions: MovementResult["readyActions"] = [];







    const tileEvents: GameEventData[] = [];
    let stopAtCell: { x: number; y: number } | null = null;
    let cellsConsumed = 0;
    let previousCell = { x: fromX, y: fromY };
    for (const cell of traversedCells) {
      const entryRes = await this.persistentArea.resolveEntry(
        participant,
        cell,
        encounterId,
        (ability) =>
          this.getPersistentAreaSaveModifier(
            participant,
            ability,
            ownerUserId,
          ),
        `${encounter.currentRound}:${encounter.currentTurnIndex}`,
        previousCell,
      );
      tileEvents.push(...entryRes.events);
      cellsConsumed++;
      previousCell = cell;
      if (entryRes.stopMovement) {
        stopAtCell = cell;
        break;
      }
    }
    const traversedUpToStop = traversedCells.slice(0, cellsConsumed);
    const moveThroughRes = await this.persistentArea.resolveMoveThrough(
      participant,
      traversedUpToStop,
      encounterId,
      `${encounter.currentRound}:${encounter.currentTurnIndex}`,
    );
    tileEvents.push(...moveThroughRes.events);


    const finalX = stopAtCell?.x ?? targetX;
    const finalY = stopAtCell?.y ?? targetY;
    readyActions = await this.checkReadyActions(
      participant,
      fromX,
      fromY,
      finalX,
      finalY,
      encounterId,
    );
    participant.positionX = finalX;
    participant.positionY = finalY;

    const finalCostFt = stopAtCell
      ? this.computeMoveCost(
          fromX,
          fromY,
          finalX,
          finalY,
          difficultCells,
          ignoresDifficultTerrain,
          isProne,
        ).costFt
      : distanceFt;
    participant.movementRemaining -= finalCostFt;
    await this.participantRepo.save(participant);

    const locationBoundConditionEvents =
      (await this.persistentArea.removeLocationBoundConditionsOutsideAreas?.(
        participant,
        { x: finalX, y: finalY },
      )) ?? [];
    tileEvents.push(...locationBoundConditionEvents);


    const auraParticipants = await this.participantRepo.find({
      where: { encounterId },
      relations: ["monster"],
    });
    const auraEntry = await this.persistentArea.relocateAurasByCaster(
      participant.id,
      {
        x: finalX,
        y: finalY,
      },
      {
        participants: auraParticipants,
        getSaveModifier: (ability, target) =>
          this.getPersistentAreaSaveModifier(
            target ?? participant,
            ability,
            ownerUserId,
          ),
        turnKey: `${encounter.currentRound}:${encounter.currentTurnIndex}`,
        persistParticipant: (target) =>
          this.participantRepo.update(target.id, {
            effectInstances: target.effectInstances,
          }),
      },
    );
    tileEvents.push(...auraEntry.events);
    const witchBoltEvents =
      await this.breakOutOfRangeWitchBoltTethers(encounterId);

    const events: GameEventData[] = [
      {
        event_type: "movement",
        actor_participant_id: participantId,
        data: {
          fromX,
          fromY,
          toX: finalX,
          toY: finalY,
          requestedX: targetX,
          requestedY: targetY,
          distanceCells,
          distanceFt: finalCostFt,
          difficultCellsCrossed,
          hasLandsStride,
          bypassedByFreedomOfMovement: protectedByFreedom,
          remainingMovement: participant.movementRemaining,
          stoppedByTileEffect: stopAtCell != null,
        },
      },

      ...tileEvents,
      ...witchBoltEvents,
    ];
    if (difficultCellsCrossed > 0) {
      events.push({
        event_type: "difficult_terrain_traversed",
        actor_participant_id: participantId,
        data: {
          cellsCrossed: difficultCellsCrossed,
          extraCostFt: ignoresDifficultTerrain
            ? 0
            : difficultCellsCrossed * 5,
          bypassedByLandsStride: hasLandsStride,
          bypassedByFreedomOfMovement: protectedByFreedom,
        },
      });
    }




    for (const oa of opportunityAttacks) {
      events.push({
        event_type: "opportunity_attack_available",
        actor_participant_id: oa.attackerParticipantId,
        target_participant_id: participantId,
        data: {
          attackerName: oa.attackerName,
          mover: participantId,
          fromX,
          fromY,
          toX: targetX,
          toY: targetY,
        },
      });
    }
    for (const ready of readyActions) {
      events.push({
        event_type: "ready_action_available",
        actor_participant_id: ready.reactorParticipantId,
        target_participant_id: participantId,
        data: {
          reactorName: ready.reactorName,
          actionName: ready.actionName,
          mover: participantId,
          fromX,
          fromY,
          toX: finalX,
          toY: finalY,
        },
      });
    }

    return success(
      {
        participantId,
        fromX,
        fromY,
        toX: finalX,
        toY: finalY,
        distanceFt: finalCostFt,
        remainingMovement: participant.movementRemaining,
        opportunityAttacks,
        readyActions,
      },
      events,
    );
  }

  async standUp(
    encounterId: string,
    participantId: string,
    ownerUserId?: string,
  ): Promise<
    GameResult<{
      participantId: string;
      movementSpent: number;
      remainingMovement: number;
    }>
  > {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== participantId) {
      return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");
    }

    const participant = await this.encounterService.getParticipant(participantId);
    const proneInstances = (participant.conditionInstances ?? []).filter(
      (condition) => condition.slug === "prone",
    );
    if (
      proneInstances.length === 0 &&
      !(participant.conditions ?? []).includes("prone")
    ) {
      return failure("O participante nao esta caido.", "INVALID_ACTION");
    }

    const speed = await this.getSpeed(participant, ownerUserId);
    if (speed <= 0) {
      return failure(
        "Velocidade 0 impede levantar-se.",
        "CONDITION_PREVENTS_MOVEMENT",
      );
    }
    const movementSpent = standingMovementCost(speed);
    const remainingMovement = participant.movementRemaining ?? speed;
    if (remainingMovement < movementSpent) {
      return failure(
        `Levantar exige ${movementSpent}ft de movimento; restam ${remainingMovement}ft.`,
        "INSUFFICIENT_MOVEMENT",
      );
    }

    participant.movementRemaining = remainingMovement - movementSpent;
    const events: GameEventData[] = [];
    for (const condition of proneInstances) {
      const removed = await this.conditionLifecycle.removeConditionInstance(
        participant,
        condition.id,
        "stood_up",
      );
      events.push(...removed.events);
    }
    if (proneInstances.length === 0) {
      participant.conditions = (participant.conditions ?? []).filter(
        (condition) => condition !== "prone",
      );
      await this.participantRepo.save(participant);
    }

    events.unshift({
      event_type: "stood_up",
      actor_participant_id: participant.id,
      data: {
        movementSpent,
        remainingMovement: participant.movementRemaining,
      },
    });
    return success(
      {
        participantId,
        movementSpent,
        remainingMovement: participant.movementRemaining,
      },
      events,
    );
  }

  private async breakOutOfRangeWitchBoltTethers(
    encounterId: string,
  ): Promise<GameEventData[]> {
    const events: GameEventData[] = [];
    const participants = await this.participantRepo.find({
      where: { encounterId, isDefeated: false },
    });
    for (const caster of participants) {
      const tether = findWitchBoltTether(caster);
      if (!tether) continue;
      const target = participants.find(
        (participant) => participant.id === tether.targetParticipantId,
      );
      if (!target) continue;
      const distanceFt = witchBoltDistanceFt(caster, target);
      if (distanceFt == null || distanceFt <= tether.rangeFt) continue;

      const breakResult = await this.concentration.break(caster, "expired");
      events.push({
        event_type: "witch_bolt_ended",
        actor_participant_id: caster.id,
        target_participant_id: target.id,
        data: {
          reason: "out_of_range",
          distanceFt,
          rangeFt: tether.rangeFt,
        },
      });
      events.push(...breakResult.events);
    }
    return events;
  }


  private computeMoveCost(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    difficultCells: Set<string>,
    ignoresDifficultTerrain: boolean,
    isProne: boolean,
  ): {
    costFt: number;
    difficultCellsCrossed: number;
    traversedCells: Array<{ x: number; y: number }>;
  } {










    let cost = 0;
    let crossed = 0;
    const traversed: Array<{ x: number; y: number }> = [];
    let cx = fromX;
    let cy = fromY;
    while (cx !== toX && cy !== toY) {
      cx += Math.sign(toX - cx);
      cy += Math.sign(toY - cy);
      traversed.push({ x: cx, y: cy });
      const isDiff = difficultCells.has(`${cx},${cy}`);
      if (isDiff) crossed++;
      cost += movementCellCostFt({
        difficultTerrain: isDiff,
        ignoresDifficultTerrain,
        prone: isProne,
      });
    }
    while (cx !== toX) {
      cx += Math.sign(toX - cx);
      traversed.push({ x: cx, y: cy });
      const isDiff = difficultCells.has(`${cx},${cy}`);
      if (isDiff) crossed++;
      cost += movementCellCostFt({
        difficultTerrain: isDiff,
        ignoresDifficultTerrain,
        prone: isProne,
      });
    }
    while (cy !== toY) {
      cy += Math.sign(toY - cy);
      traversed.push({ x: cx, y: cy });
      const isDiff = difficultCells.has(`${cx},${cy}`);
      if (isDiff) crossed++;
      cost += movementCellCostFt({
        difficultTerrain: isDiff,
        ignoresDifficultTerrain,
        prone: isProne,
      });
    }
    return {
      costFt: cost,
      difficultCellsCrossed: crossed,
      traversedCells: traversed,
    };
  }

  private async getPersistentAreaSaveModifier(
    participant: EncounterParticipantEntity,
    ability: SaveAbility,
    ownerUserId?: string,
  ): Promise<{
    modifier: number;
    advantage: boolean;
    disadvantage: boolean;
    autoFail: boolean;
  }> {
    let modifier = 0;
    if (participant.type === "pc" && participant.characterId && ownerUserId) {
      try {
        const sheet = await this.sheetService.computeSheet(
          ownerUserId,
          participant.characterId,
        );
        modifier =
          sheet.savingThrows.find((savingThrow) => savingThrow.slug === ability)
            ?.bonus ?? 0;
      } catch {
        modifier = 0;
      }
    } else if (participant.monster) {
      modifier = getMonsterSavingThrowBonus(
        participant.monster as unknown as Record<string, unknown>,
        ability,
      );
    }
    const conditionModifiers = this.conditionEffects.getSavingThrowModifiers(
      participant.conditions ?? [],
      ability,
    );
    return {
      modifier,
      advantage: conditionModifiers.hasAdvantage,
      disadvantage: conditionModifiers.hasDisadvantage,
      autoFail: conditionModifiers.autoFail,
    };
  }


  async dashAction(
    encounterId: string,
    participantId: string,
    ownerUserId?: string,
  ): Promise<GameResult<MovementState>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active")
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");

    const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
    if (currentPid !== participantId)
      return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");

    const participant =
      await this.encounterService.getParticipant(participantId);
    if (participant.actionUsed)
      return failure("Acao ja utilizada neste turno.", "NO_ACTION_AVAILABLE");

    const speed = await this.getSpeed(participant, ownerUserId);
    if (participant.movementRemaining == null) {
      participant.movementRemaining = speed;
    }

    participant.movementRemaining += speed;
    participant.actionUsed = true;
    participant.hasDashed = true;
    await this.participantRepo.save(participant);

    return success({
      speed,
      remainingMovement: participant.movementRemaining,
      hasDashed: true,
      hasDisengaged: participant.hasDisengaged,
      actionUsed: true,
      bonusActionUsed: participant.bonusActionUsed,
    });
  }


  async disengageAction(
    encounterId: string,
    participantId: string,
  ): Promise<GameResult<MovementState>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active")
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");

    const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
    if (currentPid !== participantId)
      return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");

    const participant =
      await this.encounterService.getParticipant(participantId);
    if (participant.actionUsed)
      return failure("Acao ja utilizada neste turno.", "NO_ACTION_AVAILABLE");

    const speed = await this.getSpeed(participant);

    participant.actionUsed = true;
    participant.hasDisengaged = true;
    await this.participantRepo.save(participant);

    return success({
      speed,
      remainingMovement: participant.movementRemaining ?? speed,
      hasDashed: participant.hasDashed,
      hasDisengaged: true,
      actionUsed: true,
      bonusActionUsed: participant.bonusActionUsed,
    });
  }


  private async checkOpportunityAttacks(
    mover: EncounterParticipantEntity,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    encounterId: string,
  ): Promise<Array<{ attackerParticipantId: string; attackerName: string }>> {

    const enemies = await this.participantRepo.find({
      where: { encounterId, isDefeated: false },
    });

    const results: Array<{
      attackerParticipantId: string;
      attackerName: string;
    }> = [];

    for (const enemy of enemies) {

      if (enemy.faction === mover.faction) continue;
      if (enemy.id === mover.id) continue;
      if (enemy.positionX == null || enemy.positionY == null) continue;

      if (enemy.reactionsUsed > 0) continue;
      if (!canTakeReactionFromConditions(enemy.conditions)) continue;
      if (
        (enemy.effectInstances ?? []).some(
          (effect) => effect.kind === "opportunity_attacks_blocked",
        )
      ) {
        continue;
      }

      const wasAdjacent = this.isAdjacent(
        fromX,
        fromY,
        enemy.positionX,
        enemy.positionY,
      );
      const stillAdjacent = this.isAdjacent(
        toX,
        toY,
        enemy.positionX,
        enemy.positionY,
      );


      if (wasAdjacent && !stillAdjacent) {
        results.push({
          attackerParticipantId: enemy.id,
          attackerName: enemy.displayName,
        });
      }
    }

    return results;
  }

  private async checkReadyActions(
    mover: EncounterParticipantEntity,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    encounterId: string,
  ): Promise<
    Array<{
      reactorParticipantId: string;
      reactorName: string;
      actionName: string;
    }>
  > {
    const participants = await this.participantRepo.find({
      where: { encounterId, isDefeated: false },
    });
    const results: Array<{
      reactorParticipantId: string;
      reactorName: string;
      actionName: string;
    }> = [];

    for (const reactor of participants) {
      const prepared = reactor.readiedAction;
      if (!prepared || prepared.trigger.kind !== "enemy_enters_range") continue;
      if (reactor.id === mover.id || reactor.faction === mover.faction) continue;
      if (reactor.positionX == null || reactor.positionY == null) continue;
      if ((reactor.reactionsUsed ?? 0) > 0) continue;
      if (!canTakeReactionFromConditions(reactor.conditions)) continue;
      if (prepared.actionDescriptor.kind !== "attack") continue;

      const rangeFt = prepared.trigger.rangeFt;
      const beforeFt =
        Math.max(
          Math.abs(fromX - reactor.positionX),
          Math.abs(fromY - reactor.positionY),
        ) * 5;
      const afterFt =
        Math.max(
          Math.abs(toX - reactor.positionX),
          Math.abs(toY - reactor.positionY),
        ) * 5;
      if (beforeFt <= rangeFt || afterFt > rangeFt) continue;

      results.push({
        reactorParticipantId: reactor.id,
        reactorName: reactor.displayName,
        actionName: prepared.actionDescriptor.actionName,
      });
    }

    return results;
  }


  private isAdjacent(x1: number, y1: number, x2: number, y2: number): boolean {
    return Math.abs(x1 - x2) <= 1 && Math.abs(y1 - y2) <= 1;
  }


  async initializeTurn(
    participant: EncounterParticipantEntity,
    ownerUserId?: string,
  ): Promise<void> {
    this.logger.debug("encounter.turn.initialize", {
      "participant.id": participant.id,
      "participant.type": participant.type,
      "participant.controlled_by": participant.controlledBy,
      "previous.action_used": participant.actionUsed,
      "previous.bonus_action_used": participant.bonusActionUsed,
      "previous.movement_remaining": participant.movementRemaining,
    });
    // Preserve the creature's actual movement budget even while a condition
    // temporarily prevents movement. If the condition ends during this turn,
    // the unspent budget becomes available again.
    const speed = await this.getBaseSpeed(participant, ownerUserId);
    participant.movementRemaining = speed;
    participant.actionUsed = false;
    participant.bonusActionUsed = false;
    participant.hasDashed = false;
    participant.hasDisengaged = false;
    participant.reactionsUsed = 0;


    participant.attacksUsedThisTurn = 0;
    participant.attacksMaxThisTurn = await this.computeAttacksMaxThisTurn(
      participant,
      ownerUserId,
    );
    participant.bonusUnarmedAttacksRemainingThisTurn = 0;


    participant.recklessAttackActive = false;


    participant.freeObjectInteractionsUsed = 0;


    participant.cleaveUsedThisTurn = false;
    participant.nickUsedThisTurn = false;


    participant.sneakAttackUsedThisTurn = false;


    if (participant.type === "pc" && participant.characterId && ownerUserId) {
      await this.applyChampionStartTurnTriggers(participant, ownerUserId);
    }

    await this.participantRepo.save(participant);
  }


  private async applyChampionStartTurnTriggers(
    participant: EncounterParticipantEntity,
    ownerUserId: string,
  ): Promise<void> {
    try {
      const sheet = await this.sheetService.computeSheet(
        ownerUserId,
        participant.characterId!,
      );
      const features = (
        (
          sheet as unknown as {
            features?: Array<{ slug: string; active?: boolean }>;
          }
        ).features ?? []
      ).filter((f) => f.active !== false);
      const hasHeroicWarrior = features.some((f) =>
        f.slug.startsWith("heroic-warrior"),
      );
      const hasSurvivor = features.some((f) => f.slug.startsWith("survivor"));


      if (hasHeroicWarrior) {
        const stateResp = await this.stateService
          .setInspiration(participant.characterId!, true)
          .catch(() => null);
        if (stateResp?.inspiration === true) {

        }
      }


      if (
        hasSurvivor &&
        sheet.currentHp > 0 &&
        sheet.currentHp <= Math.floor(sheet.maxHp / 2)
      ) {
        const conAbility = sheet.abilityScores.find((a) => a.slug === "con");
        const conMod = conAbility?.modifier ?? 0;
        const regen = 5 + conMod;
        const hpRes = await this.stateService.updateHp(
          ownerUserId,
          participant.characterId!,
          { healing: regen },
        );
        participant.currentHp = hpRes.currentHp;
      }
    } catch {

    }
  }


  private async computeAttacksMaxThisTurn(
    participant: EncounterParticipantEntity,
    ownerUserId?: string,
  ): Promise<number> {
    if (participant.type === "pc" && participant.characterId && ownerUserId) {
      try {
        const actions = await this.actionsService.getActions(
          ownerUserId,
          participant.characterId,
        );
        const count = actions.summary?.attackCount;
        if (typeof count === "number" && count > 0) return count;
      } catch {

      }
    }
    return 1;
  }
}
