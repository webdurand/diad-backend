import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { createHash } from "crypto";
import type { Request } from "express";
import { Observable, of } from "rxjs";
import { finalize } from "rxjs/operators";

/**
 * Serializa comandos de mutação por encontro (single-writer).
 *
 * P0 confirmado em 2026-07-27: dois POST /class-feature (second-wind) em
 * paralelo retornavam 201 ok:true os dois — o efeito era aplicado duas vezes —
 * mas o banco registrava só 1 uso. Lost update clássico: cada request carregou
 * a mesma linha, decrementou e gravou.
 *
 * Mesmo mecanismo já em produção no caminho narrativo
 * (`ai-proxy.controller.ts` tryAcquireSessionTurnLock), aqui aplicado ao
 * combate:
 * - duplo-clique idêntico (mesmo corpo) é DEDUPLICADO: a segunda chamada
 *   recebe a resposta canônica de "já em andamento" em vez de executar de novo;
 * - comando DIFERENTE concorrente no mesmo encontro é rejeitado com 409, em vez
 *   de enfileirado — com ataque a ~2s, enfileirar transformaria duplo-submit em
 *   4s de espera.
 *
 * INVARIANTE: o lock é em processo. Ele é correto porque o backend roda como um
 * único processo `node dist/main` (sem PM2, sem cluster, sem réplicas). Se um
 * dia houver mais de uma instância, este lock precisa virar advisory lock no
 * Postgres ou Redis. `main.ts` loga um erro se detectar variáveis de
 * multi-instância.
 */

/**
 * TTL é apenas rede de segurança para o caso de o processo morrer no meio do
 * comando — a liberação real acontece no `finalize`/`catch`. Precisa ser maior
 * que o comando mais lento do encontro: `POST /ai-turn` chega a ~8s e turnos
 * narrativos já foram medidos em ~40s. Um TTL curto expiraria com o comando
 * ainda rodando e deixaria outro entrar, reabrindo exatamente a corrida que
 * este lock existe para fechar.
 */
const COMMAND_LOCK_TTL_MS = 120_000;

type LockEntry = {
  expiresAt: number;
  fingerprint: string;
};

const activeCommands = new Map<string, LockEntry>();

function sweep(now: number): void {
  if (activeCommands.size <= 128) return;
  for (const [key, entry] of activeCommands) {
    if (entry.expiresAt <= now) activeCommands.delete(key);
  }
}

/**
 * O alvo tem de ser a URL CONCRETA, nunca o padrão da rota. Com o padrão
 * (`/game/encounters/:id/participants/:participantId`) todo path param além do
 * encontro desaparece do hash: remover o participante A e depois o B — ambos
 * sem corpo — colidiriam, e a segunda remoção seria descartada em silêncio.
 * Mesma classe de bug em aprovar dois join-requests e em death-save de dois PCs.
 */
export function buildCommandFingerprint(
  method: string,
  target: string,
  body: unknown,
): string {
  let payload: string;
  try {
    payload = JSON.stringify(body ?? {});
  } catch {
    // Corpo circular/não serializável: sem impressão digital estável não dá
    // para deduplicar, então tratamos como comando único.
    payload = `unhashable:${Math.random()}`;
  }
  return createHash("sha256")
    .update(`${method} ${target} ${payload}`)
    .digest("hex");
}

export function __resetEncounterCommandLockForTests(): void {
  activeCommands.clear();
}

@Injectable()
export class EncounterCommandLockInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const encounterId = resolveEncounterId(req);
    if (!encounterId) return next.handle();

    const fingerprint = buildCommandFingerprint(
      req.method,
      concreteTarget(req),
      req.body,
    );
    const now = Date.now();
    const current = activeCommands.get(encounterId);

    if (current && current.expiresAt > now) {
      // Os dois casos precisam ser ERRO HTTP, não corpo 2xx.
      //
      // Devolver `{ok:false}` com 200/201 fazia o cliente tratar o envelope
      // como se fosse o recurso: `handleResponse` não lança, e um call site que
      // tipa a resposta como `Encounter` gravava `{ok:false, code, error}` no
      // estado da página — o encontro ficava sem `id`, o socket caía e a tela
      // se desmontava. Como este é o interceptor mais externo, o
      // GameResultStatusInterceptor nem veria esse corpo para corrigir o status.
      const duplicate = current.fingerprint === fingerprint;
      throw new ConflictException(
        duplicate
          ? {
              ok: false,
              code: "COMMAND_IN_PROGRESS",
              error: "Esta ação já está sendo processada.",
              hint: "Aguarde a resolução da ação anterior antes de repetir.",
            }
          : {
              ok: false,
              code: "ENCOUNTER_BUSY",
              error: "Outra ação deste encontro ainda está sendo resolvida.",
              hint: "Aguarde a ação em andamento terminar.",
            },
      );
    }

    sweep(now);
    activeCommands.set(encounterId, {
      expiresAt: now + COMMAND_LOCK_TTL_MS,
      fingerprint,
    });

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      const entry = activeCommands.get(encounterId);
      if (entry?.fingerprint === fingerprint) {
        activeCommands.delete(encounterId);
      }
    };

    try {
      // `finalize` cobre sucesso, erro e unsubscribe do observable. O try/catch
      // cobre o caso em que o handler estoura ANTES de virar observable — sem
      // ele o lock ficaria preso até o TTL de 30s e o encontro travaria.
      return next.handle().pipe(finalize(release));
    } catch (err) {
      release();
      throw err;
    }
  }
}

/** URL sem query string. `originalUrl` inclui o prefixo global e os params. */
function concreteTarget(req: Request): string {
  const raw = req.originalUrl ?? req.url ?? req.path ?? "";
  return raw.split("?")[0];
}

/**
 * Só rotas de mutação de encontro entram no lock. Leituras (GET) nunca são
 * serializadas, e rotas que não têm encontro no path passam direto.
 */
function resolveEncounterId(req: Request): string | null {
  if (req.method === "GET" || req.method === "HEAD") return null;
  const path = req.route?.path ?? req.path ?? "";
  if (!path.includes("encounters/:id")) return null;
  const id = (req.params as Record<string, string> | undefined)?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
