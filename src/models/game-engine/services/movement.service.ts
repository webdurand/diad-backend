import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { ActionsService } from 'src/models/characters/services/actions.service';
import { EncounterService } from './encounter.service';
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from '../interfaces/result.type';

export interface MovementResult {
  participantId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  distanceFt: number;
  remainingMovement: number;
  /** Participants that can make opportunity attacks during this move */
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
  ) {}

  /**
   * Get the base movement speed for a participant.
   * PCs: from character sheet (race speed). Monsters: from monster.speed.walk.
   */
  async getSpeed(
    participant: EncounterParticipantEntity,
    ownerUserId?: string,
  ): Promise<number> {
    if (participant.type === 'pc' && participant.characterId && ownerUserId) {
      try {
        const actions = await this.actionsService.getActions(
          ownerUserId,
          participant.characterId,
        );
        return actions.movement?.speed ?? 30;
      } catch {
        return 30;
      }
    }

    if (
      (participant.type === 'monster' || participant.type === 'npc') &&
      participant.monster
    ) {
      return this.parseMonsterSpeed(participant.monster.speed);
    }

    return 30;
  }

  /**
   * Parse monster speed JSONB. E.g. { walk: "30 ft." } -> 30
   */
  private parseMonsterSpeed(speed: Record<string, unknown>): number {
    if (!speed) return 30;
    const walk = speed.walk;
    if (typeof walk === 'number') return walk;
    if (typeof walk === 'string') {
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
    const participant = await this.encounterService.getParticipant(participantId);
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

  /**
   * Move a participant to a target cell. Validates:
   * - It's their turn
   * - Enough remaining movement
   * - Target cell is in bounds and not occupied
   * - Detects opportunity attacks (leaving melee range without Disengage)
   */
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
    if (!encounter || encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    // Validate it's this participant's turn
    const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
    if (currentPid !== participantId)
      return failure('Nao e o turno deste participante.', 'NOT_YOUR_TURN');

    const participant = await this.encounterService.getParticipant(participantId);
    if (participant.isDefeated)
      return failure('Participante derrotado.', 'CONDITION_PREVENTS_ACTION');

    const fromX = participant.positionX ?? 0;
    const fromY = participant.positionY ?? 0;

    // Validate bounds
    const gridCols = encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
    const gridRows = encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
    if (targetX < 0 || targetX >= gridCols || targetY < 0 || targetY >= gridRows)
      return failure('Posicao fora dos limites do grid.', 'POSITION_OUT_OF_BOUNDS');

    // Validate not occupied
    const occupant = await this.participantRepo
      .createQueryBuilder('p')
      .where('p.encounter_id = :encounterId', { encounterId })
      .andWhere('p.position_x = :x', { x: targetX })
      .andWhere('p.position_y = :y', { y: targetY })
      .andWhere('p.is_defeated = false')
      .andWhere('p.id != :pid', { pid: participantId })
      .getOne();
    if (occupant)
      return failure(`Posicao ocupada por ${occupant.displayName}.`, 'POSITION_OCCUPIED');

    // Calculate distance (Manhattan for grid-based D&D)
    const distanceCells = Math.abs(targetX - fromX) + Math.abs(targetY - fromY);
    const distanceFt = distanceCells * 5;

    // Initialize movement if not set
    const speed = await this.getSpeed(participant, ownerUserId);
    if (participant.movementRemaining == null) {
      participant.movementRemaining = speed;
    }

    if (distanceFt > participant.movementRemaining)
      return failure(
        `Movimento insuficiente: precisa ${distanceFt}ft, tem ${participant.movementRemaining}ft.`,
        'OUT_OF_RANGE',
      );

    // Check for opportunity attacks (if not disengaged)
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

    // Apply movement
    participant.positionX = targetX;
    participant.positionY = targetY;
    participant.movementRemaining -= distanceFt;
    await this.participantRepo.save(participant);

    const events: GameEventData[] = [
      {
        event_type: 'movement',
        actor_participant_id: participantId,
        data: {
          fromX,
          fromY,
          toX: targetX,
          toY: targetY,
          distanceFt,
          remainingMovement: participant.movementRemaining,
        },
      },
    ];

    return success(
      {
        participantId,
        fromX,
        fromY,
        toX: targetX,
        toY: targetY,
        distanceFt,
        remainingMovement: participant.movementRemaining,
        opportunityAttacks,
      },
      events,
    );
  }

  /**
   * Dash action: doubles remaining movement by adding base speed.
   * Consumes the participant's action.
   */
  async dashAction(
    encounterId: string,
    participantId: string,
    ownerUserId?: string,
  ): Promise<GameResult<MovementState>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
    if (currentPid !== participantId)
      return failure('Nao e o turno deste participante.', 'NOT_YOUR_TURN');

    const participant = await this.encounterService.getParticipant(participantId);
    if (participant.actionUsed)
      return failure('Acao ja utilizada neste turno.', 'NO_ACTION_AVAILABLE');

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

  /**
   * Disengage action: prevents opportunity attacks for the rest of the turn.
   * Consumes the participant's action.
   */
  async disengageAction(
    encounterId: string,
    participantId: string,
  ): Promise<GameResult<MovementState>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
    if (currentPid !== participantId)
      return failure('Nao e o turno deste participante.', 'NOT_YOUR_TURN');

    const participant = await this.encounterService.getParticipant(participantId);
    if (participant.actionUsed)
      return failure('Acao ja utilizada neste turno.', 'NO_ACTION_AVAILABLE');

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

  /**
   * Check if moving from (fromX,fromY) triggers opportunity attacks.
   * An opportunity attack can happen when a participant leaves the melee
   * reach (adjacent cells) of an enemy who has their reaction available.
   */
  private async checkOpportunityAttacks(
    mover: EncounterParticipantEntity,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    encounterId: string,
  ): Promise<Array<{ attackerParticipantId: string; attackerName: string }>> {
    // Get all non-defeated enemies
    const enemies = await this.participantRepo.find({
      where: { encounterId, isDefeated: false },
    });

    const results: Array<{ attackerParticipantId: string; attackerName: string }> = [];

    for (const enemy of enemies) {
      // Skip same faction, self, or enemies without position
      if (enemy.faction === mover.faction) continue;
      if (enemy.id === mover.id) continue;
      if (enemy.positionX == null || enemy.positionY == null) continue;
      // Skip if reaction already used this round
      if (enemy.reactionsUsed > 0) continue;

      const wasAdjacent = this.isAdjacent(fromX, fromY, enemy.positionX, enemy.positionY);
      const stillAdjacent = this.isAdjacent(toX, toY, enemy.positionX, enemy.positionY);

      // Opportunity attack triggers when leaving melee range (adjacent -> not adjacent)
      if (wasAdjacent && !stillAdjacent) {
        results.push({
          attackerParticipantId: enemy.id,
          attackerName: enemy.displayName,
        });
      }
    }

    return results;
  }

  /** Two cells are adjacent if Chebyshev distance <= 1 (includes diagonals). */
  private isAdjacent(x1: number, y1: number, x2: number, y2: number): boolean {
    return Math.abs(x1 - x2) <= 1 && Math.abs(y1 - y2) <= 1;
  }

  /**
   * Initialize movement for a participant at the start of their turn.
   * Called by CombatService.endTurn() when advancing to the next participant.
   */
  async initializeTurn(
    participant: EncounterParticipantEntity,
    ownerUserId?: string,
  ): Promise<void> {
    const speed = await this.getSpeed(participant, ownerUserId);
    participant.movementRemaining = speed;
    participant.actionUsed = false;
    participant.bonusActionUsed = false;
    participant.hasDashed = false;
    participant.hasDisengaged = false;
    participant.reactionsUsed = 0;
    await this.participantRepo.save(participant);
  }
}
