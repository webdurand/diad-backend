import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { ActionsService } from "src/models/characters/services/actions.service";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import { EncounterService } from "./encounter.service";
import { PersistentAreaService } from "./persistent-area.service";
import { ExhaustionService } from "./exhaustion.service";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";

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
}

export interface MovementState {
  speed: number;
  remainingMovement: number;
  hasDashed: boolean;
  hasDisengaged: boolean;
  actionUsed: boolean;
  bonusActionUsed: boolean;
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
  ) {
    this.logger.setContext(MovementService.name);
  }


  async getSpeed(
    participant: EncounterParticipantEntity,
    ownerUserId?: string,
  ): Promise<number> {
    let baseSpeed = 30;
    if (participant.type === "pc" && participant.characterId && ownerUserId) {
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


    const reductionTotal = (participant.effectInstances ?? [])
      .filter((e) => e.kind === "speed_reduction")
      .reduce(
        (sum, e) => sum + ((e.payload as { amount?: number })?.amount ?? 0),
        0,
      );


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

    return Math.max(0, baseSpeed - reductionTotal - exhaustionSpeedPenalty);
  }


  private parseMonsterSpeed(speed: Record<string, unknown>): number {
    if (!speed) return 30;
    const walk = speed.walk;
    if (typeof walk === "number") return walk;
    if (typeof walk === "string") {
      const match = walk.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 30;
    }
    return 30;
  }

  async getMovementState(
    encounterId: string,
    participantId: string,
    ownerUserId?: string,
  ): Promise<GameResult<MovementState>> {
    const participant =
      await this.encounterService.getParticipant(participantId);
    const speed = await this.getSpeed(participant, ownerUserId);

    return success({
      speed,
      remainingMovement: participant.movementRemaining ?? speed,
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

    const fromX = participant.positionX ?? 0;
    const fromY = participant.positionY ?? 0;


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





    const distanceCells = Math.max(
      Math.abs(targetX - fromX),
      Math.abs(targetY - fromY),
    );
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
      hasLandsStride,
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


    const opportunityAttacks = participant.hasDisengaged
      ? []
      : await this.checkOpportunityAttacks(
          participant,
          fromX,
          fromY,
          targetX,
          targetY,
          encounterId,
        );







    const tileEvents: GameEventData[] = [];
    let stopAtCell: { x: number; y: number } | null = null;
    let cellsConsumed = 0;
    for (const cell of traversedCells) {
      const entryRes = await this.persistentArea.resolveEntry(
        participant,
        cell,
        encounterId,




      );
      tileEvents.push(...entryRes.events);
      cellsConsumed++;
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
    );
    tileEvents.push(...moveThroughRes.events);


    const finalX = stopAtCell?.x ?? targetX;
    const finalY = stopAtCell?.y ?? targetY;
    participant.positionX = finalX;
    participant.positionY = finalY;

    const finalCostFt = stopAtCell
      ? this.computeMoveCost(
          fromX,
          fromY,
          finalX,
          finalY,
          difficultCells,
          hasLandsStride,
        ).costFt
      : distanceFt;
    participant.movementRemaining -= finalCostFt;
    await this.participantRepo.save(participant);


    await this.persistentArea.relocateAurasByCaster(participant.id, {
      x: finalX,
      y: finalY,
    });

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
          remainingMovement: participant.movementRemaining,
          stoppedByTileEffect: stopAtCell != null,
        },
      },

      ...tileEvents,
    ];
    if (difficultCellsCrossed > 0) {
      events.push({
        event_type: "difficult_terrain_traversed",
        actor_participant_id: participantId,
        data: {
          cellsCrossed: difficultCellsCrossed,
          extraCostFt: hasLandsStride ? 0 : difficultCellsCrossed * 5,
          bypassedByLandsStride: hasLandsStride,
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
      },
      events,
    );
  }


  private computeMoveCost(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    difficultCells: Set<string>,
    hasLandsStride: boolean,
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
      cost += isDiff && !hasLandsStride ? 10 : 5;
    }
    while (cx !== toX) {
      cx += Math.sign(toX - cx);
      traversed.push({ x: cx, y: cy });
      const isDiff = difficultCells.has(`${cx},${cy}`);
      if (isDiff) crossed++;
      cost += isDiff && !hasLandsStride ? 10 : 5;
    }
    while (cy !== toY) {
      cy += Math.sign(toY - cy);
      traversed.push({ x: cx, y: cy });
      const isDiff = difficultCells.has(`${cx},${cy}`);
      if (isDiff) crossed++;
      cost += isDiff && !hasLandsStride ? 10 : 5;
    }
    return {
      costFt: cost,
      difficultCellsCrossed: crossed,
      traversedCells: traversed,
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
    const speed = await this.getSpeed(participant, ownerUserId);
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
