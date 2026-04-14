import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import {
  failure,
  GameErrorCode,
  GameEventData,
  GameResult,
  success,
} from '../interfaces/result.type';
import type { LairAction } from '../interfaces/combat.interfaces';

const INCAPACITATING_SLUGS = new Set([
  'incapacitated',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
]);

/**
 * Spec 004 — Lair Actions (MM intro "Lair Actions").
 *
 * Em encontros com `inLair=true`, no início de cada round (initiative count 20)
 * o monstro lendário tem direito a 1 lair action escolhida pelo DM/IA.
 */
@Injectable()
export class LairActionService {
  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounters: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
  ) {}

  /**
   * Verifica se há lair action para oferecer no início do round.
   * Retorna a lista de monstros lendários vivos com lair_actions populadas.
   */
  async availableForRound(
    encounter: EncounterEntity,
  ): Promise<
    Array<{
      participantId: string;
      monsterName: string;
      options: LairAction[];
    }>
  > {
    if (!encounter.inLair) return [];
    const parts = await this.participants.find({
      where: { encounterId: encounter.id },
      relations: ['monster'],
    });
    const out: Array<{
      participantId: string;
      monsterName: string;
      options: LairAction[];
    }> = [];
    for (const p of parts) {
      if (p.isDefeated || p.dyingState === 'dead') continue;
      const slugs = new Set([
        ...(p.conditions ?? []),
        ...(p.conditionInstances ?? []).map((ci) => ci.slug),
      ]);
      if ([...INCAPACITATING_SLUGS].some((s) => slugs.has(s))) continue;
      const list = p.monster?.lair_actions;
      if (!list || list.length === 0) continue;
      out.push({
        participantId: p.id,
        monsterName: p.displayName,
        options: list,
      });
    }
    return out;
  }

  /**
   * Resolve uma lair action escolhida.
   * actionIndex=null indica skip.
   */
  async execute(
    encounter: EncounterEntity,
    monsterParticipantId: string,
    actionIndex: number | null,
  ): Promise<
    GameResult<{
      monsterParticipantId: string;
      actionName?: string;
      skipped: boolean;
      action?: LairAction;
    }>
  > {
    if (!encounter.inLair) return failure(GameErrorCode.LAIR_ACTION_NOT_AVAILABLE);
    const monster = await this.participants.findOne({
      where: { id: monsterParticipantId, encounterId: encounter.id },
      relations: ['monster'],
    });
    if (!monster) return failure(GameErrorCode.PARTICIPANT_NOT_FOUND);

    const slugs = new Set([
      ...(monster.conditions ?? []),
      ...(monster.conditionInstances ?? []).map((ci) => ci.slug),
    ]);
    if ([...INCAPACITATING_SLUGS].some((s) => slugs.has(s))) {
      return failure(GameErrorCode.CONDITION_PREVENTS_LEGENDARY);
    }

    const list = monster.monster?.lair_actions;
    if (!list || list.length === 0) {
      return failure(GameErrorCode.LAIR_ACTION_NOT_AVAILABLE);
    }

    if (actionIndex == null) {
      const events: GameEventData[] = [
        {
          event_type: 'lair_action_skipped',
          actor_participant_id: monster.id,
          data: { round: encounter.currentRound },
        },
      ];
      return { ...success({ monsterParticipantId, skipped: true }), events };
    }

    if (actionIndex < 0 || actionIndex >= list.length) {
      return failure(GameErrorCode.INVALID_ACTION);
    }
    const action = list[actionIndex];

    return {
      ...success({
        monsterParticipantId,
        actionName: action.name,
        skipped: false,
        action,
      }),
      events: [
        {
          event_type: 'lair_action_used',
          actor_participant_id: monster.id,
          data: {
            actionName: action.name,
            description: action.description,
            round: encounter.currentRound,
          },
        },
      ],
    };
  }
}
