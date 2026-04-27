import { Params as PinoParams } from "nestjs-pino";
import pino from "pino";

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

export interface BuildPinoOptionsArgs {
  env?: string;
  level?: string;
  serviceVersion?: string;
}

/**
 * Constrói options pro nestjs-pino LoggerModule. Inclui:
 *  - redaction de auth/cookie/password/apiKey/token/secret
 *  - err serializer recursivo (cause chain)
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
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
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

export const SENSITIVE_LOG_PATHS = SENSITIVE_PATHS;
export { serializeError as __serializeErrorForTest };
