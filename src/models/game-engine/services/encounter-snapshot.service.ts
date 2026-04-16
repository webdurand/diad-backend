import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import {
  failure,
  GameErrorCode,
  GameResult,
  success,
} from '../interfaces/result.type';
import type {
  EncounterSnapshot,
  SnapshotParticipant,
} from '../interfaces/encounter-snapshot.interface';
import { CombatService } from './combat.service';
import type { TurnActionBlock } from '../interfaces/combat.interfaces';

/**
 * Spec 003 T049 — monta `EncounterSnapshot` auto-contido para consumo de IA.
 *
 * Modelo simples de visibilidade nesta spec: todos visíveis por default
 * (exceto `hidden` que é detectado via `conditions`). Sight system completo
 * (line-of-sight, cover, dim light) fica pra spec 005.
 */
@Injectable()
export class EncounterSnapshotService {
  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly combatService: CombatService,
  ) {}

  async build(
    encounterId: string,
    authUserId: string,
  ): Promise<GameResult<EncounterSnapshot>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure(GameErrorCode.ENCOUNTER_NOT_FOUND);

    const participants = await this.participantRepo.find({
      where: { encounterId: encounter.id },
      relations: ['monster'],
    });

    const currentTurnParticipantId =
      encounter.turnOrder[encounter.currentTurnIndex] ?? '';

    const snapParticipants: SnapshotParticipant[] = await Promise.all(
      participants.map(async (p) => {
        // Tenta buscar availableActions via CombatService.getTurnActions.
        // Se falhar (ex: participante que não é o do turno), retorna array vazio.
        let availableActions: TurnActionBlock[] = [];
        try {
          const turnRes = await this.combatService.getTurnActions(
            encounter.id,
            p.id,
            authUserId,
          );
          if (turnRes.ok) {
            availableActions = [
              ...turnRes.value.actions,
              ...turnRes.value.bonusActions,
              ...turnRes.value.reactions,
            ];
          }
        } catch {
          // noop — snapshot ainda é útil sem availableActions completos
        }

        return {
          id: p.id,
          type: p.type as 'pc' | 'monster' | 'npc',
          faction: p.faction,
          displayName: p.displayName,
          controlledBy: p.controlledBy ?? 'pc',
          position: {
            x: p.positionX ?? 0,
            y: p.positionY ?? 0,
          },
          hp: {
            current: p.currentHp ?? 0,
            max: p.maxHp ?? 0,
            tempHp: p.tempHp,
          },
          dyingState: p.dyingState,
          conditions: p.conditions ?? [],
          actionEconomy: {
            actionUsed: p.actionUsed,
            bonusUsed: p.bonusActionUsed,
            movementRemaining: p.movementRemaining ?? 0,
            movementMax: p.movementRemaining ?? 30,
            reactionUsed: p.reactionsUsed > 0,
          },
          dodgingUntilTurnOfParticipantId: p.dodgingUntilTurnOfParticipantId,
          helpingAllyParticipantId: p.helpingAllyParticipantId,
          helpingTargetParticipantId: p.helpingTargetParticipantId,
          readiedAction: p.readiedAction,
          hidden: (p.conditions ?? []).includes('hidden'),
          statblockRef:
            p.type === 'monster' && p.monster
              ? { monsterSlug: p.monster.slug ?? p.monster.name ?? '' }
              : undefined,
          availableActions,
          distances: computeDistances(p, participants),
          canSee: computeVisibility(p, participants),
        } as SnapshotParticipant;
      }),
    );

    return success({
      encounterId: encounter.id,
      round: encounter.currentRound,
      currentTurnParticipantId,
      participants: snapParticipants,
      map: encounter.mapData
        ? {
            width:
              (encounter.mapData as { gridColumns?: number; gridSize?: number })
                .gridColumns ??
              (encounter.mapData as { gridSize?: number }).gridSize ??
              20,
            height:
              (encounter.mapData as { gridRows?: number; gridSize?: number })
                .gridRows ??
              (encounter.mapData as { gridSize?: number }).gridSize ??
              20,
          }
        : undefined,
      generatedAt: new Date().toISOString(),
    });
  }
}

function computeDistances(
  self: EncounterParticipantEntity,
  all: EncounterParticipantEntity[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const other of all) {
    if (other.id === self.id) continue;
    const dx = (self.positionX ?? 0) - (other.positionX ?? 0);
    const dy = (self.positionY ?? 0) - (other.positionY ?? 0);
    out[other.id] = Math.ceil(Math.sqrt(dx * dx + dy * dy)) * 5;
  }
  return out;
}

function computeVisibility(
  self: EncounterParticipantEntity,
  all: EncounterParticipantEntity[],
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  // Modelo simples: todos visíveis, exceto quem está `hidden`. Sight system
  // completo fica pra 005.
  for (const other of all) {
    if (other.id === self.id) continue;
    const otherHidden = (other.conditions ?? []).includes('hidden');
    // `self` vê `other` se other não está escondido
    out[other.id] = !otherHidden;
  }
  return out;
}
