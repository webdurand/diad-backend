

import type { ErrorCode } from "../errors/error-codes.catalog";


export interface UpstreamContext {
  service: "diad-backend" | "diad-frontend" | "diad-agents" | string;
  status: number;
  code?: string;
  body?: unknown;
  traceId?: string;
}


export interface FieldError {
  path: string;
  message: string;
  code?: string;
}


export interface ErrorContext {
  upstream?: UpstreamContext;
  campaignId?: string;
  sessionId?: string;
  userId?: string;
  characterId?: string;
  encounterId?: string;
  [key: string]: unknown;
}


export interface ErrorEnvelope {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: ErrorCode | string;
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  context?: ErrorContext;
  hint?: string;
  errors?: FieldError[];


  ok?: false;
  error?: string;
}
