import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import {
  failure,
  GameErrorCode,
  GameEventData,
  GameResult,
  success,
} from '../interfaces/result.type';

const INCAPACITATING_SLUGS = new Set([
  'incapacitated',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
]);

export interface LegendaryActionExecuteResult {
  monsterParticipantId: string;
  actionName: string;
  cost: 1 | 2 | 3;
  legendaryPointsRemaining: number;
  legendaryPointsMax: number;
}

/**
 * Spec 004 — Pool de pontos lendários.
 *
 * Responsável por:
 *  - validar custo, condition prevent (incapacitated), pool atual
 *  - debitar pontos
 *  - reset no início do turno do dono
 *
 * Resolução do efeito (saves/dano) fica delegada ao caller (geralmente
 * `monster-action-resolver` reutilizado).
 */
@Injectable()
export class LegendaryActionService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
  ) {}

  canExecute(
    monster: EncounterParticipantEntity,
    actionName: string,
  ): GameResult<{ cost: 1 | 2 | 3 }> {
    if (monster.legendaryPointsAvailable == null) {
      return failure(GameErrorCode.INVALID_PARTICIPANT);
    }
    const slugs = (monster.conditionInstances ?? []).map((ci) => ci.slug);
    const conditions = new Set([...(monster.conditions ?? []), ...slugs]);
    for (const s of conditions) {
      if (INCAPACITATING_SLUGS.has(s)) {
        return failure(GameErrorCode.CONDITION_PREVENTS_LEGENDARY);
      }
    }
    const map = monster.monster?.legendary_action_cost_map ?? {};
    const cost = (map[actionName] as 1 | 2 | 3 | undefined) ?? 1;
    if ((monster.legendaryPointsAvailable ?? 0) < cost) {
      return failure(GameErrorCode.INSUFFICIENT_LEGENDARY_POINTS);
    }
    return success({ cost });
  }

  async spendPoints(
    monster: EncounterParticipantEntity,
    cost: 1 | 2 | 3,
    actionName: string,
  ): Promise<{ events: GameEventData[]; result: LegendaryActionExecuteResult }> {
    monster.legendaryPointsAvailable =
      (monster.legendaryPointsAvailable ?? 0) - cost;
    await this.participants.save(monster);
    return {
      events: [
        {
          event_type: 'legendary_action_used',
          actor_participant_id: monster.id,
          data: {
            actionName,
            cost,
            legendaryPointsRemaining: monster.legendaryPointsAvailable,
          },
        },
      ],
      result: {
        monsterParticipantId: monster.id,
        actionName,
        cost,
        legendaryPointsRemaining: monster.legendaryPointsAvailable ?? 0,
        legendaryPointsMax: monster.legendaryPointsMax ?? 0,
      },
    };
  }

  async resetPool(
    monster: EncounterParticipantEntity,
  ): Promise<{ events: GameEventData[] }> {
    if (monster.legendaryPointsMax == null) return { events: [] };
    if (monster.legendaryPointsAvailable === monster.legendaryPointsMax) {
      return { events: [] };
    }
    monster.legendaryPointsAvailable = monster.legendaryPointsMax;
    await this.participants.save(monster);
    return {
      events: [
        {
          event_type: 'legendary_pool_reset',
          actor_participant_id: monster.id,
          data: { legendaryPointsAvailable: monster.legendaryPointsAvailable },
        },
      ],
    };
  }
}
