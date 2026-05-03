import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CharacterStateEntity,
  RestSessionEntity,
  RestEventTemplateEntity,
} from "src/entities";
import { RestKind, RestEventTriggered } from "src/entities/rest-session.entity";
import { GameResult, failure } from "../interfaces/result.type";

/** Short/long rest RAW 2024. Stub — métodos retornam failure() até implementação. */
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
    label: "setup" | "event" | "wake";
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
    return failure(
      "Short rest service not yet implemented (spec 016 M4).",
      "INVALID_ACTION",
    );
  }

  async longRest(
    _request: LongRestRequest,
  ): Promise<GameResult<RestSessionResponse>> {
    return failure(
      "Long rest service not yet implemented (spec 016 M4).",
      "INVALID_ACTION",
    );
  }

  /** Priority order: bond > chekhov > dream > mythic > interruption > nothing. Max 1 per long rest. */
  protected async pickRestEvent(
    _campaignId: string,
    _kind: RestKind,
  ): Promise<RestEventTriggered | null> {
    return null;
  }
}
