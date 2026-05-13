import { randomBytes } from "crypto";



const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;
const TRACEPARENT_REGEX = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const ZERO_TRACE_ID = "0".repeat(32);
const ZERO_SPAN_ID = "0".repeat(16);


export function generateTraceId(): string {
  let id = randomBytes(TRACE_ID_BYTES).toString("hex");
  while (id === ZERO_TRACE_ID) {
    id = randomBytes(TRACE_ID_BYTES).toString("hex");
  }
  return id;
}


export function generateSpanId(): string {
  let id = randomBytes(SPAN_ID_BYTES).toString("hex");
  while (id === ZERO_SPAN_ID) {
    id = randomBytes(SPAN_ID_BYTES).toString("hex");
  }
  return id;
}


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
