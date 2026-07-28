import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Response } from "express";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

/**
 * Traduz falha de domínio (`{ ok: false, code }`) para status HTTP real.
 *
 * Hoje um @Post sem @HttpCode devolve **201 Created** mesmo quando a ação foi
 * recusada (NOT_YOUR_TURN, BONUS_ACTION_ALREADY_USED, ...). O React Query trata
 * 201 como sucesso, então uma ação REJEITADA ainda dispara o refetch inteiro e
 * o erro nunca chega ao usuário como erro.
 *
 * MUDANÇA DE CONTRATO: fica atrás de `STRICT_GAME_RESULT_STATUS=1` e default
 * desligado, para que o backend possa subir sozinho sem quebrar clientes que
 * ainda leem 201. Ligue depois que o frontend correspondente estiver em prod.
 */

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHORIZED: 401,

  FORBIDDEN: 403,
  FORBIDDEN_CAMPAIGN_MEMBER: 403,
  CONTROL_CHANGE_FORBIDDEN: 403,

  ENCOUNTER_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  CHARACTER_NOT_FOUND: 404,
  PARTICIPANT_NOT_FOUND: 404,

  ENCOUNTER_BUSY: 409,
  COMMAND_IN_PROGRESS: 409,
  ENCOUNTER_ALREADY_ACTIVE: 409,
  ENCOUNTER_COMPLETED: 409,
  ENCOUNTER_NOT_ACTIVE: 409,
  ENCOUNTER_NOT_PREPARING: 409,
  CHARACTER_ALREADY_IN_ENCOUNTER: 409,
  NOT_YOUR_TURN: 409,
  NO_ACTION_AVAILABLE: 409,
  NO_BONUS_ACTION_AVAILABLE: 409,
  NO_REACTION_AVAILABLE: 409,
  ACTION_ALREADY_USED: 409,
  BONUS_ACTION_ALREADY_USED: 409,
  REACTION_ALREADY_USED: 409,
  NO_USES_REMAINING: 409,
  ACTION_RECHARGING: 409,
  MULTIATTACK_NOT_RECHARGED: 409,
  CONDITION_PREVENTS_ACTION: 409,
  ALREADY_CONCENTRATING: 409,
  TARGET_DEFEATED: 409,
  ALREADY_DEAD: 409,
  OUT_OF_MOVEMENT: 409,
  POSITION_OCCUPIED: 409,

  AI_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
};

export function resolveGameFailureStatus(code: unknown): number {
  if (typeof code !== "string") return 400;
  const mapped = STATUS_BY_CODE[code];
  if (mapped) return mapped;
  if (code.endsWith("_NOT_FOUND")) return 404;
  if (code.startsWith("FORBIDDEN")) return 403;
  if (code.endsWith("_ALREADY_USED")) return 409;
  return 400;
}

function isGameFailure(body: unknown): body is { ok: false; code?: unknown } {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { ok?: unknown }).ok === false
  );
}

@Injectable()
export class GameResultStatusInterceptor implements NestInterceptor {
  private readonly enabled = process.env.STRICT_GAME_RESULT_STATUS === "1";

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.enabled || context.getType() !== "http") return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((body: unknown) => {
        if (isGameFailure(body)) {
          res.status(resolveGameFailureStatus(body.code));
        }
        return body;
      }),
    );
  }
}
