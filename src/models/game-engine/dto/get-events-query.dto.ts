import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsISO8601,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Spec 006 — Query params para GET /encounters/:id/events.
 */
export class GetEventsQueryDto {
  /** Retorna eventos com createdAt > since (ISO 8601). */
  @IsOptional()
  @IsISO8601()
  since?: string;

  /** Filtra por tipo(s) de evento em camelCase, separados por vírgula. */
  @IsOptional()
  @IsString()
  type?: string;

  /** Máximo de eventos retornados (1–200, default 50). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Offset para paginação (default 0). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** Tipos válidos de evento (camelCase). */
export const VALID_EVENT_TYPES = [
  "attackRoll",
  "damageApplied",
  "spellCast",
  "spellDamage",
  "spellHealing",
  "concentrationCheck",
  "concentrationLost",
  "concentrationStarted",
  "conditionApplied",
  "conditionRemoved",
  "conditionExpired",
  "turnStart",
  "turnEnd",
  "roundStart",
  "hpChange",
  "deathSave",
  "effectApplied",
  "effectExpired",
  "classFeatureInvoked",
  "classFeatureUsed",
  "legendaryActionUsed",
  "lairActionUsed",
  "movement",
  "movementForced",
  "grappleEscapeSuccess",
  "grappleEscapeFailed",
  "controlChanged",
  "encounterStart",
  "encounterEnd",
  "participantJoined",
  "playerInvited",
  "aoeTargetHit",
  "multiattackStart",
  "multiattackEnd",
  "savingThrow",
  "skillCheck",
  "saveRolled",
  "endOfTurnSaveRolled",
  "fellUnconscious",
  "instantDeath",
  "grappleAutoRelease",
  "helpConsumed",
  "legendaryPoolReset",
  "rechargeRolled",
  "persistentAreaTick",
  "persistentAreaExpired",
  "persistentAreaRemoved",
  "persistentAreaCreated",
  // Spec 013 — ground effect lifecycle events (Princípio X 3 camadas).
  "tileEffectCreated",
  "tileEffectSaveRolled",
  "tileEffectDamageApplied",
  "tileEffectConditionApplied",
  "tileEffectMovementStopped",
  "tileEffectExpired",
  "tileEffectConcentrationBroken",
  "difficultTerrainTraversed",
  "shieldRetroactiveReview",
  "shieldDamageReverted",
  "stateExpired",
  "lootDropped",
  "joinRequested",
  "deathSaveFailedFromDamage",
] as const;
