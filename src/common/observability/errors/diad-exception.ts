import { HttpException } from "@nestjs/common";
import { ErrorCode } from "./error-codes.catalog";
import { ERROR_CODE_METADATA } from "./error-codes.metadata";
import type {
  ErrorContext,
  FieldError,
  UpstreamContext,
} from "../types/error-envelope.types";

export interface DiadExceptionOptions {
  context?: ErrorContext;
  hint?: string;
  cause?: unknown;
}

export interface UpstreamExceptionOptions extends DiadExceptionOptions {
  upstream: UpstreamContext;
}

export interface ValidationExceptionOptions extends DiadExceptionOptions {
  errors?: FieldError[];
}

interface DiadExceptionBody {
  code: ErrorCode;
  message: string;
  context?: ErrorContext;
  hint?: string;
  errors?: FieldError[];
}

/**
 * Base exception classe pra todo erro cross-boundary do backend (Princípio XI).
 *
 * Carrega code semântico, message PT-BR, context livre, hint opcional, cause preservado.
 * Status HTTP é derivado do catálogo; subclasses podem refinar.
 */
export class DiadException extends HttpException {
  public readonly code: ErrorCode;
  public readonly hint?: string;
  public readonly context?: ErrorContext;
  public readonly errors?: FieldError[];

  constructor(
    code: ErrorCode,
    message: string,
    options: DiadExceptionOptions & { errors?: FieldError[] } = {},
  ) {
    const status = ERROR_CODE_METADATA[code]?.httpStatus ?? 500;
    const body: DiadExceptionBody = {
      code,
      message,
      ...(options.context ? { context: options.context } : {}),
      ...(options.hint ? { hint: options.hint } : {}),
      ...(options.errors ? { errors: options.errors } : {}),
    };
    super(body, status, options.cause ? { cause: options.cause } : undefined);
    this.code = code;
    this.hint = options.hint;
    this.context = options.context;
    this.errors = options.errors;
  }
}

/**
 * Erros de domínio (regras de negócio, recursos não encontrados, conflitos).
 */
export class DomainException extends DiadException {}

/**
 * Erro vindo de um service upstream (diad-agents, etc). Preserva body/status/code originais.
 */
export class UpstreamException extends DiadException {
  public readonly upstream: UpstreamContext;

  constructor(
    code: ErrorCode,
    message: string,
    options: UpstreamExceptionOptions,
  ) {
    const merged: ErrorContext = {
      ...(options.context ?? {}),
      upstream: options.upstream,
    };
    super(code, message, { ...options, context: merged });
    this.upstream = options.upstream;
  }
}

/**
 * Erros de validação de payload (ValidationPipe, schemas custom).
 */
export class ValidationException extends DiadException {
  constructor(
    code: ErrorCode,
    message: string,
    options: ValidationExceptionOptions = {},
  ) {
    super(code, message, options);
  }
}

/**
 * Erros de autenticação/autorização.
 */
export class AuthException extends DiadException {}
