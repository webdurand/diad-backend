/**
 * TypeScript mirror of contracts/error-envelope.json (RFC 9457 + DIAD extensions).
 * Single source of truth: diad-meta/specs/016-structured-errors-observability/contracts/error-envelope.json
 *
 * Princípio XI — toda exception cross-boundary tem code, traceId, cause preservado.
 */

import type { ErrorCode } from "../errors/error-codes.catalog";

/**
 * Sub-objeto preservando integralmente o erro do serviço upstream chamado.
 */
export interface UpstreamContext {
  service: "diad-backend" | "diad-frontend" | "diad-agents" | string;
  status: number;
  code?: string;
  body?: unknown;
  traceId?: string;
}

/**
 * Erro de campo (validation). Presente quando code é VALIDATION_*.
 */
export interface FieldError {
  path: string;
  message: string;
  code?: string;
}

/**
 * Bag de contexto livre. Pode incluir IDs do domínio + sub-objeto upstream.
 */
export interface ErrorContext {
  upstream?: UpstreamContext;
  campaignId?: string;
  sessionId?: string;
  userId?: string;
  characterId?: string;
  encounterId?: string;
  [key: string]: unknown;
}

/**
 * Envelope canônico emitido em respostas 4xx/5xx (RFC 9457 + extensões DIAD).
 * Content-Type esperado: application/problem+json
 */
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

  // Legacy compat layer (LEGACY_ERROR_ENVELOPE=true). Removido após 1 sprint.
  ok?: false;
  error?: string;
}
