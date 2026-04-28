/**
 * DIAD Error Codes Catalog (TS mirror).
 * Source of truth: contracts/error-codes-catalog.json (Princípio XI).
 * Adicionar code novo é não-breaking; renomear/remover é breaking.
 */

export const ErrorCode = {
  // auth
  AUTH_TOKEN_MISSING: "AUTH_TOKEN_MISSING",
  AUTH_TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  AUTH_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  AUTH_PERMISSION_DENIED: "AUTH_PERMISSION_DENIED",

  // agent
  AGENT_UPSTREAM_ERROR: "AGENT_UPSTREAM_ERROR",
  AGENT_TIMEOUT: "AGENT_TIMEOUT",
  AGENT_UNREACHABLE: "AGENT_UNREACHABLE",
  AGENT_SESSION_NOT_FOUND: "AGENT_SESSION_NOT_FOUND",
  AGENT_INVALID_RESPONSE: "AGENT_INVALID_RESPONSE",

  // campaign
  CAMPAIGN_NOT_FOUND: "CAMPAIGN_NOT_FOUND",
  CAMPAIGN_PLAYER_LIMIT_REACHED: "CAMPAIGN_PLAYER_LIMIT_REACHED",
  CAMPAIGN_FORBIDDEN: "CAMPAIGN_FORBIDDEN",

  // session
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_NOT_JOINABLE: "SESSION_NOT_JOINABLE",

  // combat
  COMBAT_NOT_FOUND: "COMBAT_NOT_FOUND",
  COMBAT_TURN_INVALID: "COMBAT_TURN_INVALID",
  COMBAT_PARTICIPANT_NOT_FOUND: "COMBAT_PARTICIPANT_NOT_FOUND",

  // character
  CHARACTER_NOT_FOUND: "CHARACTER_NOT_FOUND",
  CHARACTER_FORBIDDEN: "CHARACTER_FORBIDDEN",

  // spell
  SPELL_SLOT_UNAVAILABLE: "SPELL_SLOT_UNAVAILABLE",
  SPELL_NOT_PREPARED: "SPELL_NOT_PREPARED",

  // validation
  VALIDATION_INVALID_PAYLOAD: "VALIDATION_INVALID_PAYLOAD",
  VALIDATION_MISSING_FIELD: "VALIDATION_MISSING_FIELD",

  // system
  SYSTEM_INTERNAL_ERROR: "SYSTEM_INTERNAL_ERROR",
  SYSTEM_UNAVAILABLE: "SYSTEM_UNAVAILABLE",
  SYSTEM_RATE_LIMITED: "SYSTEM_RATE_LIMITED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",

  // event bus (spec 017)
  EVENT_TYPE_NOT_REGISTERED: "EVENT_TYPE_NOT_REGISTERED",
  TRACE_ID_INVALID: "TRACE_ID_INVALID",

  // world / ambiance (spec 019)
  WEATHER_INVALID_BIOME: "WEATHER_INVALID_BIOME",
  CLOCK_NEGATIVE_HOURS: "CLOCK_NEGATIVE_HOURS",
  CHAOS_OUT_OF_RANGE: "CHAOS_OUT_OF_RANGE",
  SPELL_BLOCKED_DEAD_MAGIC: "SPELL_BLOCKED_DEAD_MAGIC",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ALL_ERROR_CODES: readonly ErrorCode[] = Object.values(
  ErrorCode,
) as readonly ErrorCode[];

/**
 * Exhaustiveness helper — usar em switches sobre ErrorCode pra forçar
 * o TypeScript a flagar code novo sem tratamento.
 */
export function assertNever(x: never, msg = "Unhandled discriminant"): never {
  throw new Error(`${msg}: ${JSON.stringify(x)}`);
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" && ALL_ERROR_CODES.includes(value as ErrorCode)
  );
}
