import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ProblemFactory } from "./problem.factory";
import { DiadLogger } from "../logger/diad-logger.service";
import { DiadException } from "./diad-exception";
import { pickBodyOrSummary, sanitize } from "../http/request-body.interceptor";
import type { ErrorEnvelope } from "../types/error-envelope.types";

/**
 * Catch-all global filter — converte qualquer exception em envelope RFC 9457.
 *
 * Substitui GameErrorFilter (que só pegava HttpException). Princípio XI: nenhum
 * erro pode escapar como 500 cru.
 *
 * Loga também numa linha única o request body + envelope (truncados/sanitizados)
 * pra que copiando o log + colando numa IA dê pra responder direto:
 *   "que requisição falhou, com qual payload, qual o error.code, qual o detail."
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly factory: ProblemFactory,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(GlobalExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const envelope =
      exception instanceof HttpException
        ? this.factory.fromException(exception, request)
        : this.factory.fromUnknown(exception, request);

    this.logException(exception, envelope, request);

    response.setHeader("Content-Type", "application/problem+json");
    response.status(envelope.status).json(envelope);
  }

  private logException(
    exception: unknown,
    envelope: ErrorEnvelope,
    request: Request,
  ): void {
    const isClient =
      exception instanceof HttpException && exception.getStatus() < 500;
    const event = "http.server.request.failed";

    const attrs: Record<string, unknown> = {
      "error.code": envelope.code,
      "error.type":
        exception instanceof DiadException
          ? exception.constructor.name
          : exception instanceof Error
            ? exception.constructor.name
            : typeof exception,
      "http.request.method": request.method,
      "http.request.path": (request.url ?? "").split("?")[0],
      "http.response.status_code": envelope.status,
      "http.response.body": pickBodyOrSummary(envelope) ?? envelope,
    };

    const reqBody = pickBodyOrSummary(sanitize(request.body));
    if (reqBody !== undefined) attrs["http.request.body"] = reqBody;

    if (isClient) {
      this.logger.warn(event, attrs);
    } else {
      this.logger.error(event, exception, attrs);
    }
  }
}
