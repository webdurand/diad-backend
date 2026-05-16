

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
  "Archivist",
] as const;

export type EventAudience = (typeof EVENT_AUDIENCES)[number];

const EMITTING_SERVICES = [
  "diad-backend",
  "diad-agents",
  "diad-frontend",
] as const;

export type EmittingService = (typeof EMITTING_SERVICES)[number];

export interface EventEnvelopeSource {
  service: EmittingService;
  module: string;

  traceId: string;

  spanId?: string;
}

export interface EventEnvelopeScope {

  campaignId: string;
  sessionId?: string;
  sceneId?: string;
  encounterId?: string;
}

export interface EventEnvelopeMetadata {

  tacticalValue?: number;

  narrativeWeight?: number;
  tags?: string[];
  beneficiaryFaction?: "ally" | "enemy" | "neutral";
  creatureAffinity?: Record<string, number>;
  [key: string]: unknown;
}

export interface EventEnvelope {
  eventId: string;

  version: number;

  aggregateId: string;

  timestamp: string;
  eventCategory: EventCategory;

  eventType: string;
  source: EventEnvelopeSource;
  scope: EventEnvelopeScope;

  payload: Record<string, unknown>;
  audiences: EventAudience[];

  narrativeDescriptor?: string;
  metadata?: EventEnvelopeMetadata;
}


export interface EventEnvelopeInput {
  eventCategory: EventCategory;
  eventType: string;
  source: Omit<EventEnvelopeSource, "traceId"> & { traceId?: string };
  scope: EventEnvelopeScope;
  payload: Record<string, unknown>;

  aggregateId?: string;
  audiences?: EventAudience[];
  narrativeDescriptor?: string;
  metadata?: EventEnvelopeMetadata;
  version?: number;
  eventId?: string;
  timestamp?: string;
}


export const TRACE_ID_REGEX = /^[0-9a-f]{32}$/;


export const EVENT_TYPE_REGEX = /^[a-z][a-z0-9_]+$/;
