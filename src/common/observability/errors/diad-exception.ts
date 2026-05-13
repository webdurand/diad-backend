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


export class DomainException extends DiadException {}


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


export class ValidationException extends DiadException {
  constructor(
    code: ErrorCode,
    message: string,
    options: ValidationExceptionOptions = {},
  ) {
    super(code, message, options);
  }
}
