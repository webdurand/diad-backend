import { randomBytes } from "crypto";

/**
 * W3C Trace Context (https://www.w3.org/TR/trace-context/) — version 00.
 * Drop-in pra OpenTelemetry SDK quando instalado.
 */

const TRACE_ID_BYTES = 16; // 32 hex chars
const SPAN_ID_BYTES = 8; // 16 hex chars
const TRACEPARENT_REGEX = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const ZERO_TRACE_ID = "0".repeat(32);
const ZERO_SPAN_ID = "0".repeat(16);

/**
 * Gera trace-id W3C (32 lowercase hex chars). Nunca all-zeros.
 */
export function generateTraceId(): string {
  let id = randomBytes(TRACE_ID_BYTES).toString("hex");
  while (id === ZERO_TRACE_ID) {
    id = randomBytes(TRACE_ID_BYTES).toString("hex");
  }
  return id;
}

/**
 * Gera span-id W3C (16 lowercase hex chars). Nunca all-zeros.
 */
export function generateSpanId(): string {
  let id = randomBytes(SPAN_ID_BYTES).toString("hex");
  while (id === ZERO_SPAN_ID) {
    id = randomBytes(SPAN_ID_BYTES).toString("hex");
  }
  return id;
}

/**
 * Monta traceparent novo no formato 00-{traceId}-{spanId}-01 (sampled).
 */
export function generateTraceparent(traceId?: string, spanId?: string): string {
  const t = traceId ?? generateTraceId();
  const s = spanId ?? generateSpanId();
  return `00-${t}-${s}-01`;
}

export interface ParsedTraceparent {
  version: string;
  traceId: string;
  parentSpanId: string;
  flags: string;
}

/**
 * Parseia traceparent header. Retorna null se inválido (regex, all-zeros, version != 00).
 */
export function parseTraceparent(
  header: string | undefined | null,
): ParsedTraceparent | null {
  if (!header || typeof header !== "string") return null;
  const lower = header.toLowerCase();
  if (!TRACEPARENT_REGEX.test(lower)) return null;
  const [version, traceId, parentSpanId, flags] = lower.split("-");
  if (version !== "00") return null;
  if (traceId === ZERO_TRACE_ID) return null;
  if (parentSpanId === ZERO_SPAN_ID) return null;
  return { version, traceId, parentSpanId, flags };
}

export const TRACEPARENT_HEADER = "traceparent";
