/**
 * Mirror de contracts/event-envelope.json. Unidade canônica do EventBus.
 * Self-contained payloads (hpBefore + hpAfter, não só delta) — listeners
 * reagem sem ler banco; replay determinístico fica viável.
 */

export const EVENT_CATEGORIES = [
  "EncounterEvent",
  "WorldEvent",
  "NarrativeEvent",
  "SocialEvent",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_AUDIENCES = [
  "Narrator",
  "CombatAgent",
  "Director",
  "CompanionAI",
  "HUD",
] as const;

export type EventAudience = (typeof EVENT_AUDIENCES)[number];

export const EMITTING_SERVICES = [
  "diad-backend",
  "diad-agents",
  "diad-frontend",
] as const;

export type EmittingService = (typeof EMITTING_SERVICES)[number];

export interface EventEnvelopeSource {
  service: EmittingService;
  module: string;
  /** W3C trace-id — 32 lowercase hex chars (Princípio XI). */
  traceId: string;
  /** W3C span-id — 16 lowercase hex chars opcional. */
  spanId?: string;
}

export interface EventEnvelopeScope {
  /** AudienceMap é campaign-scoped — campaignId é obrigatório. */
  campaignId: string;
  sessionId?: string;
  sceneId?: string;
  encounterId?: string;
}

export interface EventEnvelopeMetadata {
  /** 0-10 — Combat L3 utility scoring multiplica. */
  tacticalValue?: number;
  /** 0-10 — Director/Chekhov ledger usa pra rank de payoff. */
  narrativeWeight?: number;
  tags?: string[];
  beneficiaryFaction?: "ally" | "enemy" | "neutral";
  creatureAffinity?: Record<string, number>;
  [key: string]: unknown;
}

export interface EventEnvelope {
  eventId: string;
  /** Schema version do payload deste eventType. Default 1. */
  version: number;
  /** Aggregate principal afetado — encounterId / characterId / campaignId etc. */
  aggregateId: string;
  /** ISO-8601 UTC. */
  timestamp: string;
  eventCategory: EventCategory;
  /** snake_case en machine-readable. Deve estar no catálogo (event-categories). */
  eventType: string;
  source: EventEnvelopeSource;
  scope: EventEnvelopeScope;
  /**
   * Self-contained payload (ADR-017): carrega estado pré e pós quando
   * aplicável (`hpBefore` + `hpAfter`, não só delta). Bus não valida shape
   * interno — convenção definida aqui e no contract per spec.
   */
  payload: Record<string, unknown>;
  audiences: EventAudience[];
  /** PT-BR ≤120 chars (Princípio X). */
  narrativeDescriptor?: string;
  metadata?: EventEnvelopeMetadata;
}

/**
 * Input parcial usado por publishers — eventId/timestamp/audiences podem
 * ser preenchidos pela factory/bus.
 */
export interface EventEnvelopeInput {
  eventCategory: EventCategory;
  eventType: string;
  source: Omit<EventEnvelopeSource, "traceId"> & { traceId?: string };
  scope: EventEnvelopeScope;
  payload: Record<string, unknown>;
  /**
   * Opcional — quando ausente, factory infere do escopo mais específico
   * disponível (encounter > session > scene > campaign). Princípio X
   * exige aggregateId em todo envelope (ADR-017).
   */
  aggregateId?: string;
  audiences?: EventAudience[];
  narrativeDescriptor?: string;
  metadata?: EventEnvelopeMetadata;
  version?: number;
  eventId?: string;
  timestamp?: string;
}

/**
 * Regex W3C trace-id — 32 lowercase hex chars, não all-zero.
 */
export const TRACE_ID_REGEX = /^[0-9a-f]{32}$/;

/**
 * Regex eventType — ^[a-z][a-z0-9_]+$ (snake_case en, padrão indústria).
 */
export const EVENT_TYPE_REGEX = /^[a-z][a-z0-9_]+$/;

export function isEventCategory(v: unknown): v is EventCategory {
  return typeof v === "string" && (EVENT_CATEGORIES as readonly string[]).includes(v);
}

export function isEventAudience(v: unknown): v is EventAudience {
  return typeof v === "string" && (EVENT_AUDIENCES as readonly string[]).includes(v);
}
