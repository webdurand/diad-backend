import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Converte exceções NestJS (Unauthorized, Forbidden, NotFound, BadRequest)
 * para o envelope padrão `{ok:false, error, code}` usado por endpoints de combate.
 *
 * Erros 500 (não tratados) caem para o comportamento default do NestJS.
 */
@Catch(HttpException)
export class GameErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(GameErrorFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const res = exception.getResponse() as unknown;

    // Se já está no envelope (vindo de ValidationPipe ou service), passthrough
    if (
      res &&
      typeof res === 'object' &&
      'ok' in (res as Record<string, unknown>) &&
      (res as Record<string, unknown>).ok === false
    ) {
      return response.status(status).json(res);
    }

    // Normaliza HTTP status -> code do envelope
    const code = this.mapStatusToCode(status);
    const message = this.extractMessage(res, exception.message);

    return response.status(status).json({
      ok: false,
      error: message,
      code,
    });
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.BAD_REQUEST:
        return 'INVALID_PAYLOAD';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      default:
        return 'ERROR';
    }
  }

  private extractMessage(res: unknown, fallback: string): string {
    if (typeof res === 'string') return res;
    if (res && typeof res === 'object') {
      const obj = res as Record<string, unknown>;
      if (typeof obj.message === 'string') return obj.message;
      if (Array.isArray(obj.message)) return obj.message.join('; ');
      if (typeof obj.error === 'string') return obj.error;
    }
    return fallback;
  }
}
