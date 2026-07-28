import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { Observable } from "rxjs";
import { mergeMap } from "rxjs/operators";
import { RealtimeService } from "src/realtime/realtime.service";
import { ClientIdContext } from "src/common/http/client-id.context";
import { CommandSnapshotService } from "../services/command-snapshot.service";

/**
 * Faz TODO comando de encontro devolver o estado novo já pronto, e empurra o
 * mesmo estado para os outros clientes da sala.
 *
 * Antes: 1 clique = POST (esperar) → GET /encounters/:id (esperar) →
 * GET /events + GET /turn. O custo do servidor aparecia duas vezes e os outros
 * jogadores não recebiam nada (attack/damage/heal/move nunca emitiam
 * `encounter:invalidate`).
 *
 * Depois: 1 clique = 1 POST que já volta com `snapshot`, e os demais clientes
 * recebem `encounter:snapshot` com o mesmo payload. `originClientId` identifica
 * a origem para os eventos legados; o snapshot é entregue também à própria aba
 * como fallback e deduplicado pelo `at` monotônico.
 *
 * Aditivo por construção: cliente antigo ignora o campo novo e continua
 * refetchando. Por isso backend e frontend podem subir em qualquer ordem.
 */
@Injectable()
export class CommandSnapshotInterceptor implements NestInterceptor {
  constructor(
    private readonly snapshots: CommandSnapshotService,
    private readonly realtime: RealtimeService,
    private readonly clientIdContext: ClientIdContext,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    // Publica no CLS antes do handler para que `emitEncounterInvalidate`, que
    // roda dentro dele, também consiga marcar a aba de origem.
    const originClientId = this.clientIdContext.captureFrom(req);

    const encounterId = resolveMutatedEncounterId(req);
    if (!encounterId) return next.handle();

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        if (!isSuccessBody(body)) return body;

        const snapshot = await this.snapshots.build(encounterId);
        if (!snapshot) return body;

        this.realtime.emitToRoom(`encounter:${encounterId}`, "encounter:snapshot", {
          encounterId,
          originClientId,
          snapshot,
        });

        return { ...body, snapshot };
      }),
    );
  }
}

function isSuccessBody(body: unknown): body is Record<string, unknown> {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { ok?: unknown }).ok === true
  );
}


/**
 * Só mutações de encontro. GET nunca paga o custo, e rotas fora de
 * `encounters/:id` passam direto.
 */
function resolveMutatedEncounterId(req: Request): string | null {
  if (req.method === "GET" || req.method === "HEAD") return null;
  const path = req.route?.path ?? req.path ?? "";
  if (!path.includes("encounters/:id")) return null;
  const id = (req.params as Record<string, string> | undefined)?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
