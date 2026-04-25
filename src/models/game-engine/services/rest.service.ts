import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CharacterStateEntity,
  RestSessionEntity,
  RestEventTemplateEntity,
} from 'src/entities';
import {
  RestKind,
  RestEventTriggered,
} from 'src/entities/rest-session.entity';
import {
  GameResult,
  failure,
} from '../interfaces/result.type';

/**
 * Spec 016 M0 — Rest service stub.
 *
 * Implementa short/long rest RAW 2024:
 * - Short rest: validate HP≥1 RAW 2024 novo; HD spend; restore SR features
 * - Long rest: 100% HP+HD (não half do 2014); exhaustion -1; full slots
 * - Camp events pool priorizado (max 1 event/long rest)
 *
 * Ver `specs/016-play-shell-foundation/spec.md` §6 + contract `rest-session.json`.
 *
 * STUB M0 — métodos retornam `failure('not_implemented')`. M4 wira lógica completa.
 */
export interface ShortRestRequest {
  characterId: string;
  hdToSpend: Record<string, number>; // { 'd10': 2 }
}

export interface LongRestRequest {
  characterId: string;
  watchAssignment: string; // characterId
  rationsConsumed?: number;
  acknowledgesHostileWarning?: boolean;
}

export interface RestStateDelta {
  hpDelta: number;
  hdDelta: Record<string, number>;
  slotsDelta: Record<string, number>;
  exhaustionFrom: number;
  exhaustionTo: number;
  featuresRestored: string[];
}

export interface RestSessionResponse {
  session: RestSessionEntity;
  narrationSequence: Array<{
    label: 'setup' | 'event' | 'wake';
    content: string;
  }>;
  stateDelta: RestStateDelta;
  morningBriefingId?: string;
  preparedSpellSwapAvailable: boolean;
}

@Injectable()
export class RestService {
  constructor(
    @InjectRepository(RestSessionEntity)
    private readonly restSessionRepo: Repository<RestSessionEntity>,
    @InjectRepository(RestEventTemplateEntity)
    private readonly restEventRepo: Repository<RestEventTemplateEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly stateRepo: Repository<CharacterStateEntity>,
  ) {}

  async shortRest(
    _request: ShortRestRequest,
  ): Promise<GameResult<RestSessionResponse>> {
    // TODO M4: validate HP>=1 RAW 2024; spend HD; restore SR features.
    return failure('Short rest service not yet implemented (spec 016 M4).', 'INVALID_ACTION');
  }

  async longRest(
    _request: LongRestRequest,
  ): Promise<GameResult<RestSessionResponse>> {
    // TODO M4: validate 24h gate; full HP+HD 2024; exhaustion -1;
    //         pick event from pool; trigger Morning Briefing.
    return failure('Long rest service not yet implemented (spec 016 M4).', 'INVALID_ACTION');
  }

  /**
   * Pick weighted event from pool. Max 1 per long rest.
   * Priority order: bond > chekhov > dream > mythic > interruption > nothing.
   */
  protected async pickRestEvent(
    _campaignId: string,
    _kind: RestKind,
  ): Promise<RestEventTriggered | null> {
    // TODO M4: query event templates eligible by triggerCondition;
    //         weighted roll; return picked kind or null.
    return null;
  }
}
