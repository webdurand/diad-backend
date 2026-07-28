import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { createHash } from "crypto";
import type { Request } from "express";
import { Observable } from "rxjs";
import { finalize, mergeMap } from "rxjs/operators";

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
 * - comandos DIFERENTES concorrentes no mesmo encontro aguardam em FIFO. Isso
 *   preserva a intenção de jogadores/DMs distintos sem reabrir o lost update e
 *   sem obrigar cada cliente a disputar o lock por retry.
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

/**
 * Uma ação que esperou mais que isso provavelmente já nasceu de uma tela
 * desatualizada. O domínio ainda revalida turno/economia quando ela começa, mas
 * limitar a espera evita requests e cerimônias otimistas pendurados para sempre
 * caso um handler externo trave.
 */
export const ENCOUNTER_COMMAND_QUEUE_WAIT_TIMEOUT_MS = 15_000;

/** Proteção de memória e de latência para encontros sob rajada anormal. */
export const ENCOUNTER_COMMAND_QUEUE_MAX_PENDING = 16;

type ActiveCommand = {
  expiresAt: number;
  fingerprint: string;
  token: symbol;
};

type CommandLease = {
  encounterId: string;
  token: symbol;
};

type QueuedCommand = {
  fingerprint: string;
  token: symbol;
  timer: ReturnType<typeof setTimeout>;
  isClosed: () => boolean;
  grant: (lease: CommandLease) => void;
  fail: (error: ConflictException) => void;
};

type EncounterCommandQueue = {
  active: ActiveCommand | null;
  /** Inclui o ativo e os waiters para deduplicar também dentro da fila. */
  fingerprints: Set<string>;
  waiters: QueuedCommand[];
};

const encounterCommandQueues = new Map<string, EncounterCommandQueue>();

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
  for (const queue of encounterCommandQueues.values()) {
    for (const waiter of queue.waiters) clearTimeout(waiter.timer);
  }
  encounterCommandQueues.clear();
}

@Injectable()
export class EncounterCommandLockInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const encounterId = resolveEncounterId(req);
    if (!encounterId) return next.handle();

    const fingerprint = buildCommandFingerprint(
      req.method,
      concreteTarget(req),
      req.body,
    );

    return acquireCommand(encounterId, fingerprint).pipe(
      mergeMap((lease) => {
        const release = once(() => releaseCommand(lease));
        try {
          // Este interceptor continua externo ao CommandSnapshotInterceptor.
          // Portanto o `finalize` só libera depois que mutação, snapshot e
          // publicação realtime terminaram — a fila muda a política de espera,
          // não a fronteira de consistência.
          return next.handle().pipe(finalize(release));
        } catch (err) {
          // `next.handle()` também pode falhar antes de produzir Observable.
          release();
          throw err;
        }
      }),
    );
  }
}

function acquireCommand(
  encounterId: string,
  fingerprint: string,
): Observable<CommandLease> {
  return new Observable<CommandLease>((subscriber) => {
    const queue = getOrCreateQueue(encounterId);
    expireStaleActiveCommand(encounterId, queue, Date.now());
    // Sem waiter, a expiração limpa a entrada ociosa. Esta aquisição ainda usa
    // o mesmo objeto e precisa recolocá-lo antes de registrar o novo holder.
    if (encounterCommandQueues.get(encounterId) !== queue) {
      encounterCommandQueues.set(encounterId, queue);
    }

    // Precisa continuar sendo ERRO HTTP, não corpo 2xx. Além do ativo, a busca
    // cobre a fila: dois cliques idênticos antes de chegar a vez não podem virar
    // duas mutações futuras.
    if (queue.fingerprints.has(fingerprint)) {
      subscriber.error(commandInProgressException());
      return;
    }

    queue.fingerprints.add(fingerprint);

    if (!queue.active && queue.waiters.length === 0) {
      subscriber.next(activateCommand(encounterId, queue, fingerprint));
      subscriber.complete();
      return;
    }

    if (queue.waiters.length >= ENCOUNTER_COMMAND_QUEUE_MAX_PENDING) {
      queue.fingerprints.delete(fingerprint);
      subscriber.error(queueUnavailableException("full"));
      cleanupQueueIfIdle(encounterId, queue);
      return;
    }

    const waiterToken = Symbol(`encounter-command-waiter:${encounterId}`);
    let settled = false;
    const waiter = {
      fingerprint,
      token: waiterToken,
      timer: undefined as unknown as ReturnType<typeof setTimeout>,
      isClosed: () => subscriber.closed,
      grant: (lease: CommandLease) => {
        if (settled) return;
        settled = true;
        clearTimeout(waiter.timer);
        subscriber.next(lease);
        subscriber.complete();
      },
      fail: (error: ConflictException) => {
        if (settled) return;
        settled = true;
        clearTimeout(waiter.timer);
        subscriber.error(error);
      },
    } satisfies QueuedCommand;

    waiter.timer = setTimeout(() => {
      if (settled) return;
      removeWaiter(queue, waiterToken);
      queue.fingerprints.delete(fingerprint);
      waiter.fail(queueUnavailableException("timeout"));
      cleanupQueueIfIdle(encounterId, queue);
    }, ENCOUNTER_COMMAND_QUEUE_WAIT_TIMEOUT_MS);
    queue.waiters.push(waiter);

    // Se o cliente fechou a conexão enquanto esperava, sua intenção deixa de
    // existir. Remover o ticket impede um "comando fantasma" depois do turno
    // avançar e também libera o fingerprint para uma nova tentativa explícita.
    return () => {
      if (settled) return;
      settled = true;
      clearTimeout(waiter.timer);
      if (removeWaiter(queue, waiterToken)) {
        queue.fingerprints.delete(fingerprint);
      }
      cleanupQueueIfIdle(encounterId, queue);
    };
  });
}

function getOrCreateQueue(encounterId: string): EncounterCommandQueue {
  const existing = encounterCommandQueues.get(encounterId);
  if (existing) return existing;
  const created: EncounterCommandQueue = {
    active: null,
    fingerprints: new Set<string>(),
    waiters: [],
  };
  encounterCommandQueues.set(encounterId, created);
  return created;
}

function activateCommand(
  encounterId: string,
  queue: EncounterCommandQueue,
  fingerprint: string,
): CommandLease {
  const token = Symbol(`encounter-command-active:${encounterId}`);
  queue.active = {
    expiresAt: Date.now() + COMMAND_LOCK_TTL_MS,
    fingerprint,
    token,
  };
  return { encounterId, token };
}

function releaseCommand(lease: CommandLease): void {
  const queue = encounterCommandQueues.get(lease.encounterId);
  if (!queue || queue.active?.token !== lease.token) return;

  queue.fingerprints.delete(queue.active.fingerprint);
  queue.active = null;
  promoteNextWaiter(lease.encounterId, queue);
}

function promoteNextWaiter(
  encounterId: string,
  queue: EncounterCommandQueue,
): void {
  if (queue.active) return;

  while (queue.waiters.length > 0) {
    const waiter = queue.waiters.shift()!;
    if (waiter.isClosed()) {
      clearTimeout(waiter.timer);
      queue.fingerprints.delete(waiter.fingerprint);
      continue;
    }

    const lease = activateCommand(encounterId, queue, waiter.fingerprint);
    waiter.grant(lease);
    return;
  }

  cleanupQueueIfIdle(encounterId, queue);
}

function expireStaleActiveCommand(
  encounterId: string,
  queue: EncounterCommandQueue,
  now: number,
): void {
  const active = queue.active;
  if (!active || active.expiresAt > now) return;

  // O token impede que o finalize tardio do comando expirado remova o novo
  // holder. Expirar continua sendo apenas a rede de segurança histórica; no
  // caminho normal toda liberação vem de `finalize`.
  queue.fingerprints.delete(active.fingerprint);
  queue.active = null;
  promoteNextWaiter(encounterId, queue);
}

function removeWaiter(queue: EncounterCommandQueue, token: symbol): boolean {
  const index = queue.waiters.findIndex((waiter) => waiter.token === token);
  if (index < 0) return false;
  queue.waiters.splice(index, 1);
  return true;
}

function cleanupQueueIfIdle(
  encounterId: string,
  queue: EncounterCommandQueue,
): void {
  if (queue.active || queue.waiters.length > 0) return;
  if (encounterCommandQueues.get(encounterId) === queue) {
    encounterCommandQueues.delete(encounterId);
  }
}

function commandInProgressException(): ConflictException {
  return new ConflictException({
    ok: false,
    code: "COMMAND_IN_PROGRESS",
    error: "Esta ação já está sendo processada.",
    hint: "Aguarde a resolução da ação anterior antes de repetir.",
  });
}

function queueUnavailableException(
  reason: "full" | "timeout",
): ConflictException {
  return new ConflictException({
    ok: false,
    code: "ENCOUNTER_BUSY",
    error:
      reason === "full"
        ? "Há muitas ações deste encontro aguardando resolução."
        : "O encontro continuou ocupado por muito tempo; esta ação não foi executada.",
    hint:
      reason === "full"
        ? "Aguarde as ações em andamento terminarem antes de tentar novamente."
        : "Confira o estado atualizado do encontro antes de repetir a ação.",
  });
}

function once(callback: () => void): () => void {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    callback();
  };
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
  const routePath = (req.route as { path?: unknown } | undefined)?.path;
  const paths = Array.isArray(routePath)
    ? routePath
    : [routePath ?? req.path ?? ""];
  if (
    !paths.some(
      (path) => typeof path === "string" && path.includes("encounters/:id"),
    )
  ) {
    return null;
  }
  const id = (req.params as Record<string, string> | undefined)?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
