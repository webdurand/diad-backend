import { Params as PinoParams } from "nestjs-pino";
import pino from "pino";
import type { IncomingMessage, ServerResponse } from "http";

const SENSITIVE_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "*.password",
  "*.apiKey",
  "*.api_key",
  "*.token",
  "*.secret",
];

const SILENT_PATHS = new Set(["/health", "/metrics", "/favicon.ico"]);
const DEBUG_PATH_PREFIXES = ["/_next/", "/swagger"];


function serializeError(err: unknown, depth = 0, maxDepth = 5): unknown {
  if (depth >= maxDepth) return undefined;
  if (!(err instanceof Error)) {
    if (err && typeof err === "object") return err;
    return { message: String(err) };
  }
  const out: Record<string, unknown> = {
    type: err.constructor?.name ?? "Error",
    message: err.message,
    stack: err.stack,
  };

  for (const key of Object.keys(err)) {
    if (key === "cause") continue;
    out[key] = (err as unknown as Record<string, unknown>)[key];
  }
  if (err.cause !== undefined) {
    out.cause = serializeError(err.cause, depth + 1, maxDepth);
  }
  return out;
}


function serializeRequestSlim(req: IncomingMessage): Record<string, unknown> {
  const url = (req as IncomingMessage & { url?: string }).url ?? "";
  const id = (req as IncomingMessage & { id?: unknown }).id;
  return {
    method: (req as IncomingMessage & { method?: string }).method,
    path: url.split("?")[0],
    ...(id !== undefined ? { id: String(id).slice(-6) } : {}),
  };
}


function serializeResponseSlim(res: ServerResponse): Record<string, unknown> {
  return { statusCode: res.statusCode };
}


function pickLogLevel(
  req: IncomingMessage,
  res: ServerResponse,
  err?: Error,
): "silent" | "debug" | "info" | "warn" | "error" {
  if (err) return "error";
  const status = res.statusCode;
  const method = (req as IncomingMessage & { method?: string }).method ?? "";
  const url = (req as IncomingMessage & { url?: string }).url ?? "";
  const path = url.split("?")[0];

  if (method === "OPTIONS") return "silent";
  if (status === 304) return "silent";
  if (SILENT_PATHS.has(path)) return "silent";

  for (const prefix of DEBUG_PATH_PREFIXES) {
    if (path.startsWith(prefix)) return "debug";
  }

  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

export interface BuildPinoOptionsArgs {
  env?: string;
  level?: string;
  serviceVersion?: string;
}


export function buildPinoOptions(args: BuildPinoOptionsArgs = {}): PinoParams {
  const env = args.env ?? process.env.NODE_ENV ?? "development";
  const level = args.level ?? process.env.LOG_LEVEL ?? "info";
  const serviceVersion =
    args.serviceVersion ?? process.env.npm_package_version ?? "0.0.0";

  const isDev = env === "development";

  return {
    pinoHttp: {
      level,
      redact: {
        paths: SENSITIVE_PATHS,
        censor: "[REDACTED]",
        remove: false,
      },
      serializers: {
        err: serializeError,
        req: serializeRequestSlim as unknown as typeof pino.stdSerializers.req,
        res: serializeResponseSlim as unknown as typeof pino.stdSerializers.res,
      },
      customLogLevel: pickLogLevel,
      customSuccessMessage: () => "http.server.request",
      customErrorMessage: () => "http.server.request",
      customAttributeKeys: {
        req: "http.request",
        res: "http.response",
        responseTime: "duration_ms",
        reqId: "request.id",
      },
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        "service.name": "diad-backend",
        "service.version": serviceVersion,
        "deployment.environment": env,
      },
      ...(isDev
        ? {
            transport: {
              target: "pino-pretty",
              options: {
                colorize: true,
                singleLine: false,
                translateTime: "SYS:HH:MM:ss.l",
              },
            },
          }
        : {}),
    },
  };
}

export { serializeError as __serializeErrorForTest };
