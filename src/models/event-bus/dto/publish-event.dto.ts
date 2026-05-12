import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  EVENT_AUDIENCES,
  EVENT_CATEGORIES,
  EVENT_TYPE_REGEX,
} from "src/common/event-bus/event-envelope.types";
import type {
  EmittingService,
  EventAudience,
  EventCategory,
} from "src/common/event-bus/event-envelope.types";

class PublishEventSourceDto {
  @IsIn(["diad-backend", "diad-agents", "diad-frontend"])
  service: EmittingService;

  @IsString()
  @MaxLength(200)
  module: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{32}$/, {
    message: "source.traceId precisa seguir W3C 32 hex chars lowercase.",
  })
  traceId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{16}$/)
  spanId?: string;
}

class PublishEventScopeDto {
  @IsUUID()
  campaignId: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsUUID()
  sceneId?: string;

  @IsOptional()
  @IsUUID()
  encounterId?: string;
}

/**
 * DTO usado pelo POST /events/publish. Envelopes parciais — factory completa
 * eventId/timestamp/traceId, AudienceMapService resolve audiences se ausente.
 */
export class PublishEventDto {
  @IsIn(EVENT_CATEGORIES as readonly string[])
  eventCategory: EventCategory;

  @IsString()
  @Matches(EVENT_TYPE_REGEX, {
    message: "eventType precisa ser snake_case en (^[a-z][a-z0-9_]+$).",
  })
  eventType: string;

  @ValidateNested()
  @Type(() => PublishEventSourceDto)
  source: PublishEventSourceDto;

  @ValidateNested()
  @Type(() => PublishEventScopeDto)
  scope: PublishEventScopeDto;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  aggregateId?: string;

  @IsOptional()
  @IsArray()
  @IsIn(EVENT_AUDIENCES as readonly string[], { each: true })
  audiences?: EventAudience[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  narrativeDescriptor?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  /**
   * ISO-8601 UTC opcional. Quando omitido, factory usa now(). Cliente Python
   * (Pydantic envelope) emite timestamp obrigatório no shape — DTO aceita.
   */
  @IsOptional()
  @IsString()
  timestamp?: string;
}
