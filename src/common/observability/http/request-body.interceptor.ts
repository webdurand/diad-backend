import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable, tap } from "rxjs";
import { DiadLogger } from "../logger/diad-logger.service";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const MAX_BODY_BYTES = 2048;
const MAX_STRING_CHARS = 300;
const MAX_OBJECT_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const SILENT_PATHS = new Set(["/health", "/metrics", "/favicon.ico"]);
const DEBUG_PATH_PREFIXES = ["/_next/", "/swagger"];
const SENSITIVE_KEY_RX =
  /^(authorization|cookie|password|api[_-]?key|token|secret)$/i;


@Injectable()
export class RequestBodyLogInterceptor implements NestInterceptor {
  constructor(private readonly logger: DiadLogger) {
    this.logger.setContext(RequestBodyLogInterceptor.name);
  }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== "http") return next.handle();

    const httpCtx = ctx.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();

    if (!shouldConsider(req)) return next.handle();

    return next.handle().pipe(
      tap({
        next: (body) => this.emitSuccess(req, res, body),
      }),
    );
  }

  private emitSuccess(
    req: Request,
    res: Response,
    responseBody: unknown,
  ): void {
    const method = req.method ?? "";
    const status = res.statusCode;
    const debugLevel = (process.env.LOG_LEVEL ?? "").toLowerCase() === "debug";

    const isMutation = MUTATION_METHODS.has(method);
    if (!isMutation && !debugLevel) return;
    if (status >= 400) return;

    const attrs: Record<string, unknown> = {
      "http.request.method": method,
      "http.request.path": (req.url ?? "").split("?")[0],
      "http.response.status_code": status,
    };

    const reqBody = pickBodyOrSummary(sanitize(req.body));
    if (reqBody !== undefined) attrs["http.request.body"] = reqBody;

    const resBody = pickBodyOrSummary(sanitize(responseBody));
    if (resBody !== undefined) attrs["http.response.body"] = resBody;

    if (
      attrs["http.request.body"] === undefined &&
      attrs["http.response.body"] === undefined
    ) {
      return;
    }

    this.logger.info("http.server.request.body", attrs);
  }
}

function shouldConsider(req: Request): boolean {
  const method = req.method ?? "";
  if (method === "OPTIONS") return false;
  const path = (req.url ?? "").split("?")[0];
  if (SILENT_PATHS.has(path)) return false;
  for (const p of DEBUG_PATH_PREFIXES) {
    if (path.startsWith(p)) return false;
  }
  return true;
}


export function pickBodyOrSummary(body: unknown): unknown {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== "object") return body;
  if (Array.isArray(body) && body.length === 0) return undefined;
  if (!Array.isArray(body) && Object.keys(body).length === 0) {
    return undefined;
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(body);
  } catch {
    return { "body.unserializable": true };
  }
  if (serialized.length <= MAX_BODY_BYTES) return body;

  if (Array.isArray(body)) {
    return {
      "body.size_bytes": serialized.length,
      "body.array_length": body.length,
      "body.first_items_types": body.slice(0, 5).map((v) => describeType(v)),
    };
  }

  const obj = body as Record<string, unknown>;
  const keys = Object.keys(obj);
  const keyTypes: Record<string, string> = {};
  for (const k of keys.slice(0, 30)) {
    keyTypes[k] = describeType(obj[k]);
  }
  return {
    "body.size_bytes": serialized.length,
    "body.keys": keyTypes,
    ...(keys.length > 30 ? { "body.keys_truncated": keys.length - 30 } : {}),
  };
}

function describeType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === "string") return `string[${v.length}]`;
  if (typeof v === "object") return `object[${Object.keys(v).length}]`;
  return typeof v;
}


export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_OBJECT_DEPTH) return "[depth_exceeded]";
  if (typeof value === "string") {
    return value.length <= MAX_STRING_CHARS
      ? value
      : `${value.slice(0, MAX_STRING_CHARS)}…[truncated ${value.length - MAX_STRING_CHARS} chars]`;
  }
  if (Array.isArray(value)) {
    const out = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((v) => sanitize(v, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      out.push(`[…${value.length - MAX_ARRAY_ITEMS} more]`);
    }
    return out;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RX.test(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}
