import { HttpException, Injectable, HttpStatus } from "@nestjs/common";
import type { Request } from "express";
import { ClsService } from "nestjs-cls";
import { ErrorCode, isErrorCode } from "./error-codes.catalog";
import { ERROR_CODE_METADATA } from "./error-codes.metadata";
import { DiadException } from "./diad-exception";
import type {
  ErrorEnvelope,
  FieldError,
  ErrorContext,
} from "../types/error-envelope.types";
import { generateTraceId } from "../trace/trace-context";

const ERROR_TYPE_BASE = "https://diad.dev/errors/";

interface NormalizedHttpBody {
  message?: string;
  detail?: string;
  errors?: FieldError[];
  context?: ErrorContext;
  hint?: string;
  ok?: false;
  error?: string;
  code?: string;
}

/**
 * Constrói envelope RFC 9457 + extensions a partir de exceptions/errors arbitrários.
 *
 * Sempre injeta traceId do CLS (gera fallback se ausente). Suporta flag
 * LEGACY_ERROR_ENVELOPE=true que mescla campos legados {ok:false, error, code}.
 */
@Injectable()
export class ProblemFactory {
  constructor(private readonly cls: ClsService) {}

  fromException(exc: HttpException, request: Request): ErrorEnvelope {
    if (exc instanceof DiadException) {
      return this.buildFromDiad(exc, request);
    }
    return this.buildFromHttp(exc, request);
  }

  fromUnknown(err: unknown, request: Request): ErrorEnvelope {
    const message =
      err instanceof Error ? err.message : "Erro inesperado no servidor.";
    return this.assemble({
      code: ErrorCode.SYSTEM_INTERNAL_ERROR,
      detail: message,
      request,
    });
  }

  fromValidation(messages: string[], request: Request): ErrorEnvelope {
    const errors: FieldError[] = messages.map((m) => ({
      path: "body",
      message: m,
    }));
    const detail = messages.length
      ? `Payload inválido — ${messages.join("; ")}`
      : "Payload inválido.";
    return this.assemble({
      code: ErrorCode.VALIDATION_INVALID_PAYLOAD,
      detail,
      request,
      errors,
    });
  }

  private buildFromDiad(exc: DiadException, request: Request): ErrorEnvelope {
    const body = this.normalizeBody(exc.getResponse());
    return this.assemble({
      code: exc.code,
      detail: body?.message ?? exc.message,
      request,
      hint: exc.hint ?? ERROR_CODE_METADATA[exc.code]?.defaultHint,
      context: exc.context,
      errors: exc.errors,
      statusOverride: exc.getStatus(),
    });
  }

  private buildFromHttp(exc: HttpException, request: Request): ErrorEnvelope {
    const status = exc.getStatus();
    const body = this.normalizeBody(exc.getResponse());
    const code = this.resolveCode(body, status);
    const detail =
      body?.detail ??
      body?.message ??
      body?.error ??
      this.fallbackDetail(exc.message, status);
    return this.assemble({
      code,
      detail,
      request,
      errors: body?.errors,
      context: body?.context,
      hint: body?.hint,
      statusOverride: status,
    });
  }

  private resolveCode(
    body: NormalizedHttpBody | null,
    status: number,
  ): ErrorCode {
    if (body?.code && isErrorCode(body.code)) return body.code;
    return this.statusToCode(status);
  }

  private statusToCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.AUTH_TOKEN_MISSING;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.AUTH_PERMISSION_DENIED;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.SYSTEM_INTERNAL_ERROR;
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_INVALID_PAYLOAD;
      case HttpStatus.CONFLICT:
        return ErrorCode.SYSTEM_INTERNAL_ERROR;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.SYSTEM_RATE_LIMITED;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ErrorCode.SYSTEM_UNAVAILABLE;
      default:
        if (status >= 500) return ErrorCode.SYSTEM_INTERNAL_ERROR;
        return ErrorCode.SYSTEM_INTERNAL_ERROR;
    }
  }

  private normalizeBody(raw: unknown): NormalizedHttpBody | null {
    if (!raw) return null;
    if (typeof raw === "string") return { message: raw };
    if (typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    const out: NormalizedHttpBody = {};
    if (typeof obj.message === "string") out.message = obj.message;
    else if (Array.isArray(obj.message))
      out.message = (obj.message as unknown[]).join("; ");
    if (typeof obj.detail === "string") out.detail = obj.detail;
    if (typeof obj.error === "string") out.error = obj.error;
    if (typeof obj.code === "string") out.code = obj.code;
    if (Array.isArray(obj.errors)) out.errors = obj.errors as FieldError[];
    if (obj.context && typeof obj.context === "object")
      out.context = obj.context as ErrorContext;
    if (typeof obj.hint === "string") out.hint = obj.hint;
    if (obj.ok === false) out.ok = false;
    return out;
  }

  private fallbackDetail(message: string, status: number): string {
    if (message) return message;
    return `HTTP ${status}`;
  }

  private assemble(args: {
    code: ErrorCode;
    detail: string;
    request: Request;
    hint?: string;
    context?: ErrorContext;
    errors?: FieldError[];
    statusOverride?: number;
  }): ErrorEnvelope {
    const md = ERROR_CODE_METADATA[args.code];
    const status = args.statusOverride ?? md?.httpStatus ?? 500;
    const traceId = this.readTraceId();
    const spanId = this.readClsString("spanId");
    const parentSpanId = this.readClsString("parentSpanId");

    const envelope: ErrorEnvelope = {
      type: `${ERROR_TYPE_BASE}${args.code}`,
      title: md?.defaultTitle ?? "Error",
      status,
      detail: args.detail,
      instance: args.request?.url ?? args.request?.originalUrl ?? "",
      code: args.code,
      traceId,
      ...(spanId ? { spanId } : {}),
      ...(parentSpanId ? { parentSpanId } : {}),
      ...(args.hint ? { hint: args.hint } : {}),
      ...(args.context ? { context: args.context } : {}),
      ...(args.errors && args.errors.length ? { errors: args.errors } : {}),
    };

    if (this.legacyEnabled()) {
      envelope.ok = false;
      envelope.error = args.detail;
    }

    return envelope;
  }

  private readTraceId(): string {
    const fromCls = this.readClsString("traceId");
    if (fromCls) return fromCls;
    return generateTraceId();
  }

  private readClsString(key: string): string | undefined {
    try {
      if (!this.cls.isActive()) return undefined;
      const v = this.cls.get<string>(key);
      return typeof v === "string" && v.length ? v : undefined;
    } catch {
      return undefined;
    }
  }

  private legacyEnabled(): boolean {
    const v = process.env.LEGACY_ERROR_ENVELOPE;
    if (v === undefined || v === null || v === "") return true; // default 1 sprint
    return v.toLowerCase() !== "false" && v !== "0";
  }
}
