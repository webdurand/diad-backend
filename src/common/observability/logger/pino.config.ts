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

/**
 * Recursivamente serializa Error.cause até `maxDepth` níveis.
 * pino.stdSerializers.err já lida com cause, mas garantimos formato consistente.
 */
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
  // Carrega code/context de DiadException sem importar a classe (evitar ciclo).
  for (const key of Object.keys(err)) {
    if (key === "cause") continue;
    out[key] = (err as unknown as Record<string, unknown>)[key];
  }
  if (err.cause !== undefined) {
    out.cause = serializeError(err.cause, depth + 1, maxDepth);
  }
  return out;
}

/**
 * Serializer minimalista para `req`. Sem headers, sem query, sem remoteAddress.
 * Body do request sai via RequestBodyLogInterceptor em log separado correlacionado.
 */
function serializeRequestSlim(req: IncomingMessage): Record<string, unknown> {
  const url = (req as IncomingMessage & { url?: string }).url ?? "";
  const id = (req as IncomingMessage & { id?: unknown }).id;
  return {
    method: (req as IncomingMessage & { method?: string }).method,
    path: url.split("?")[0],
    ...(id !== undefined ? { id: String(id).slice(-6) } : {}),
  };
}

/**
 * Serializer minimalista para `res`. Sem headers. Status fica.
 */
function serializeResponseSlim(
  res: ServerResponse,
): Record<string, unknown> {
  return { statusCode: res.statusCode };
}

/**
 * customLogLevel — decide o nível por response. Usado pelo nestjs-pino auto-log.
 *
 * - silent: 304, OPTIONS, /health, /metrics, /favicon.ico
 * - debug: rotas estáticas (_next, swagger)
 * - error: 5xx ou err presente
 * - warn:  4xx
 * - info:  demais 2xx/3xx
 */
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

/**
 * Constrói options pro nestjs-pino LoggerModule. Inclui:
 *  - redaction de auth/cookie/password/apiKey/token/secret
 *  - err serializer recursivo (cause chain)
 *  - req/res serializers MINIMALISTAS (sem headers/query) — body sai via
 *    RequestBodyLogInterceptor em evento separado correlacionado por trace.id
 *  - customLogLevel: silencia ruído (304, /health, OPTIONS); escala 4xx/5xx
 *  - customAttributeKeys: renomeia req→http.request, res→http.response,
 *    responseTime→duration_ms (alinha com OTel naming já usado em DiadLogger)
 *  - customSuccessMessage/customErrorMessage: msg unificada "http.server.request"
 *  - level como string (não number)
 *  - timestamp ISO
 *  - base com service.name, service.version, deployment.environment
 *  - pino-pretty transport quando env=development
 */
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
