import {
  IsBoolean,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsISO8601,
} from "class-validator";
import { Type } from "class-transformer";


export class GetEventsQueryDto {

  @IsOptional()
  @IsISO8601()
  since?: string;


  @IsOptional()
  @IsString()
  type?: string;


  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;


  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;


  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  latest?: boolean;
}


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
