import { ConflictException } from "@nestjs/common";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, Observable, of, Subject } from "rxjs";
import { delay } from "rxjs/operators";
import {
  ENCOUNTER_COMMAND_QUEUE_MAX_PENDING,
  ENCOUNTER_COMMAND_QUEUE_WAIT_TIMEOUT_MS,
  EncounterCommandLockInterceptor,
  __resetEncounterCommandLockForTests,
} from "../encounter-command-lock.interceptor";

type FakeRequest = {
  method: string;
  path: string;
  originalUrl?: string;
  route?: { path: string | string[] };
  params?: Record<string, string>;
  body?: unknown;
};

function ctx(req: FakeRequest, type: "http" | "ws" = "http"): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function handler(value: unknown, delayMs = 0): CallHandler {
  return {
    handle: () => (delayMs > 0 ? of(value).pipe(delay(delayMs)) : of(value)),
  };
}

const OK = { ok: true as const, value: {}, events: [] };

function attackRequest(
  encounterId: string,
  body: unknown = { attackerParticipantId: "p1", actionSlug: "longsword" },
): FakeRequest {
  return {
    method: "POST",
    path: `/game/encounters/${encounterId}/attack`,
    originalUrl: `/game/encounters/${encounterId}/attack`,
    route: { path: "/game/encounters/:id/attack" },
    params: { id: encounterId },
    body,
  };
}

/** Rota com DOIS path params — a que colidia quando o hash usava o padrão. */
function removeParticipantRequest(
  encounterId: string,
  participantId: string,
): FakeRequest {
  return {
    method: "DELETE",
    path: `/game/encounters/${encounterId}/participants/${participantId}`,
    originalUrl: `/game/encounters/${encounterId}/participants/${participantId}`,
    route: { path: "/game/encounters/:id/participants/:participantId" },
    params: { id: encounterId, participantId },
    body: {},
  };
}

async function conflictCode(source: Observable<unknown>): Promise<string> {
  try {
    await firstValueFrom(source);
  } catch (err) {
    const response = (err as ConflictException).getResponse();
    return (response as { code?: string }).code ?? "";
  }
  throw new Error("esperava ConflictException, nao veio");
}

describe("EncounterCommandLockInterceptor", () => {
  let interceptor: EncounterCommandLockInterceptor;

  beforeEach(() => {
    __resetEncounterCommandLockForTests();
    interceptor = new EncounterCommandLockInterceptor();
  });

  afterEach(() => {
    jest.useRealTimers();
    __resetEncounterCommandLockForTests();
  });

  it("libera o lock ao terminar, permitindo comandos sequenciais", async () => {
    const req = attackRequest("enc-1");

    const first = await firstValueFrom(
      interceptor.intercept(ctx(req), handler(OK)),
    );
    const second = await firstValueFrom(
      interceptor.intercept(ctx(req), handler(OK)),
    );

    expect(first).toBe(OK);
    expect(second).toBe(OK);
  });

  it("duplo-submit do mesmo comando nao executa de novo e vira 409, nunca corpo 2xx", async () => {
    const req = attackRequest("enc-1");
    const secondHandler = { handle: jest.fn(() => of(OK)) };

    // Primeiro comando fica em voo (não completa antes do segundo chegar).
    const inFlight = firstValueFrom(
      interceptor.intercept(ctx(req), handler(OK, 30)),
    );

    // Precisa ser exceção: um corpo {ok:false} com 200/201 era gravado no
    // estado da página por call sites que tipam a resposta como o recurso.
    const code = await conflictCode(
      interceptor.intercept(ctx(req), secondHandler as unknown as CallHandler),
    );

    expect(code).toBe("COMMAND_IN_PROGRESS");
    expect(secondHandler.handle).not.toHaveBeenCalled();

    await inFlight;
  });

  it("enfileira comando diferente e so o executa depois do ativo", async () => {
    const active = new Subject<unknown>();
    const firstHandler = { handle: jest.fn(() => active) };
    const secondHandler = { handle: jest.fn(() => of("second")) };

    const first = firstValueFrom(
      interceptor.intercept(
        ctx(attackRequest("enc-1")),
        firstHandler as unknown as CallHandler,
      ),
    );

    const otherCommand: FakeRequest = {
      method: "POST",
      path: "/game/encounters/enc-1/end-turn",
      originalUrl: "/game/encounters/enc-1/end-turn",
      route: { path: "/game/encounters/:id/end-turn" },
      params: { id: "enc-1" },
      body: {},
    };

    const second = firstValueFrom(
      interceptor.intercept(
        ctx(otherCommand),
        secondHandler as unknown as CallHandler,
      ),
    );

    expect(firstHandler.handle).toHaveBeenCalledTimes(1);
    expect(secondHandler.handle).not.toHaveBeenCalled();

    active.next("first");
    active.complete();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(secondHandler.handle).toHaveBeenCalledTimes(1);
  });

  it("nao confunde comandos que diferem so em path param (remover participante A vs B)", async () => {
    const secondHandler = { handle: jest.fn(() => of(OK)) };

    const inFlight = firstValueFrom(
      interceptor.intercept(
        ctx(removeParticipantRequest("enc-1", "p-A")),
        handler(OK, 30),
      ),
    );

    const second = firstValueFrom(
      interceptor.intercept(
        ctx(removeParticipantRequest("enc-1", "p-B")),
        secondHandler as unknown as CallHandler,
      ),
    );

    // Corpo idêntico (vazio) e mesmo padrão de rota: com hash sobre o padrão
    // isto era tratado como duplicata e a remoção de B era descartada. A URL
    // concreta faz B entrar na fila como comando distinto.
    expect(secondHandler.handle).not.toHaveBeenCalled();

    await inFlight;
    await expect(second).resolves.toBe(OK);
    expect(secondHandler.handle).toHaveBeenCalledTimes(1);
  });

  it("serializa mutacao cuja rota do Express usa uma lista de paths", async () => {
    const active = new Subject<unknown>();
    const firstRequest = attackRequest("enc-1", { action: "first" });
    firstRequest.route = {
      path: [
        "/game/encounters/:id/apply-damage",
        "/game/encounters/:id/damage",
      ],
    };
    const secondHandler = { handle: jest.fn(() => of("second")) };
    const first = firstValueFrom(
      interceptor.intercept(ctx(firstRequest), { handle: () => active }),
    );
    const second = firstValueFrom(
      interceptor.intercept(
        ctx(attackRequest("enc-1", { action: "second" })),
        secondHandler as unknown as CallHandler,
      ),
    );

    expect(secondHandler.handle).not.toHaveBeenCalled();

    active.next("first");
    active.complete();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
  });

  it("preserva FIFO para tres comandos distintos", async () => {
    const order: string[] = [];
    const active = new Subject<unknown>();
    const orderedHandler = (
      name: string,
      source: Observable<unknown>,
    ): CallHandler => ({
      handle: jest.fn(() => {
        order.push(name);
        return source;
      }),
    });

    const first = firstValueFrom(
      interceptor.intercept(
        ctx(attackRequest("enc-1", { action: "first" })),
        orderedHandler("first", active),
      ),
    );
    const second = firstValueFrom(
      interceptor.intercept(
        ctx(attackRequest("enc-1", { action: "second" })),
        orderedHandler("second", of("second")),
      ),
    );
    const third = firstValueFrom(
      interceptor.intercept(
        ctx(attackRequest("enc-1", { action: "third" })),
        orderedHandler("third", of("third")),
      ),
    );

    expect(order).toEqual(["first"]);

    active.next("first");
    active.complete();

    await expect(Promise.all([first, second, third])).resolves.toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(order).toEqual(["first", "second", "third"]);
  });

  it("deduplica tambem um fingerprint que ja esta aguardando na fila", async () => {
    const active = new Subject<unknown>();
    const first = firstValueFrom(
      interceptor.intercept(ctx(attackRequest("enc-1", { action: "first" })), {
        handle: () => active,
      }),
    );
    const queuedHandler = { handle: jest.fn(() => of("queued")) };
    const duplicateHandler = { handle: jest.fn(() => of("duplicate")) };
    const queuedRequest = attackRequest("enc-1", { action: "queued" });

    const queued = firstValueFrom(
      interceptor.intercept(
        ctx(queuedRequest),
        queuedHandler as unknown as CallHandler,
      ),
    );
    const duplicateCode = await conflictCode(
      interceptor.intercept(
        ctx(queuedRequest),
        duplicateHandler as unknown as CallHandler,
      ),
    );

    expect(duplicateCode).toBe("COMMAND_IN_PROGRESS");
    expect(queuedHandler.handle).not.toHaveBeenCalled();
    expect(duplicateHandler.handle).not.toHaveBeenCalled();

    active.next("first");
    active.complete();

    await first;
    await expect(queued).resolves.toBe("queued");
    expect(queuedHandler.handle).toHaveBeenCalledTimes(1);
    expect(duplicateHandler.handle).not.toHaveBeenCalled();
  });

  it("nao serializa encontros diferentes", async () => {
    const first = firstValueFrom(
      interceptor.intercept(ctx(attackRequest("enc-1")), handler(OK, 20)),
    );
    const second = await firstValueFrom(
      interceptor.intercept(ctx(attackRequest("enc-2")), handler(OK)),
    );

    expect(second).toBe(OK);
    await first;
  });

  it("erro assincrono do ativo libera e executa o proximo da fila", async () => {
    const active = new Subject<unknown>();
    const first = firstValueFrom(
      interceptor.intercept(ctx(attackRequest("enc-1", { action: "first" })), {
        handle: () => active,
      }),
    );
    const secondHandler = { handle: jest.fn(() => of("second")) };
    const second = firstValueFrom(
      interceptor.intercept(
        ctx(attackRequest("enc-1", { action: "second" })),
        secondHandler as unknown as CallHandler,
      ),
    );

    expect(secondHandler.handle).not.toHaveBeenCalled();
    active.error(new Error("boom"));

    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("second");
    expect(secondHandler.handle).toHaveBeenCalledTimes(1);
  });

  it("libera o lock mesmo quando o handler falha sincronicamente", async () => {
    const failing: CallHandler = {
      handle: () => {
        throw new Error("boom");
      },
    };

    await expect(
      firstValueFrom(
        interceptor.intercept(ctx(attackRequest("enc-1")), failing),
      ),
    ).rejects.toThrow("boom");

    const after = await firstValueFrom(
      interceptor.intercept(ctx(attackRequest("enc-1")), handler(OK)),
    );
    expect(after).toBe(OK);
  });

  it("remove waiter cancelado sem executar comando fantasma", async () => {
    const active = new Subject<unknown>();
    const first = firstValueFrom(
      interceptor.intercept(ctx(attackRequest("enc-1", { action: "first" })), {
        handle: () => active,
      }),
    );
    const cancelledHandler = { handle: jest.fn(() => of("cancelled")) };
    const cancelledRequest = attackRequest("enc-1", {
      action: "cancelled",
    });
    const subscription = interceptor
      .intercept(
        ctx(cancelledRequest),
        cancelledHandler as unknown as CallHandler,
      )
      .subscribe();

    expect(cancelledHandler.handle).not.toHaveBeenCalled();
    subscription.unsubscribe();

    active.next("first");
    active.complete();
    await first;

    expect(cancelledHandler.handle).not.toHaveBeenCalled();

    // O cancelamento também precisa remover o fingerprint reservado.
    await expect(
      firstValueFrom(
        interceptor.intercept(ctx(cancelledRequest), handler("retried")),
      ),
    ).resolves.toBe("retried");
  });

  it("expira waiter para nao executar uma acao antiga indefinidamente", async () => {
    jest.useFakeTimers();
    const active = new Subject<unknown>();
    const activeSubscription = interceptor
      .intercept(ctx(attackRequest("enc-1", { action: "first" })), {
        handle: () => active,
      })
      .subscribe();
    const timedOutHandler = { handle: jest.fn(() => of("late")) };
    const timedOutRequest = attackRequest("enc-1", { action: "late" });
    const code = conflictCode(
      interceptor.intercept(
        ctx(timedOutRequest),
        timedOutHandler as unknown as CallHandler,
      ),
    );

    await jest.advanceTimersByTimeAsync(
      ENCOUNTER_COMMAND_QUEUE_WAIT_TIMEOUT_MS,
    );

    await expect(code).resolves.toBe("ENCOUNTER_BUSY");
    expect(timedOutHandler.handle).not.toHaveBeenCalled();

    activeSubscription.unsubscribe();
    await expect(
      firstValueFrom(
        interceptor.intercept(ctx(timedOutRequest), handler("fresh")),
      ),
    ).resolves.toBe("fresh");
  });

  it("limita o numero de comandos pendentes por encontro", async () => {
    const active = new Subject<unknown>();
    const activeSubscription = interceptor
      .intercept(ctx(attackRequest("enc-1", { action: "active" })), {
        handle: () => active,
      })
      .subscribe();
    const queuedSubscriptions = Array.from(
      { length: ENCOUNTER_COMMAND_QUEUE_MAX_PENDING },
      (_, index) =>
        interceptor
          .intercept(
            ctx(attackRequest("enc-1", { action: `queued-${index}` })),
            handler(index),
          )
          .subscribe(),
    );
    const overflowHandler = { handle: jest.fn(() => of("overflow")) };

    const code = await conflictCode(
      interceptor.intercept(
        ctx(attackRequest("enc-1", { action: "overflow" })),
        overflowHandler as unknown as CallHandler,
      ),
    );

    expect(code).toBe("ENCOUNTER_BUSY");
    expect(overflowHandler.handle).not.toHaveBeenCalled();

    activeSubscription.unsubscribe();
    for (const subscription of queuedSubscriptions) subscription.unsubscribe();
  });

  it("ignora leituras e rotas fora de encounters/:id", async () => {
    const read: FakeRequest = {
      method: "GET",
      path: "/game/encounters/enc-1/turn",
      route: { path: "/game/encounters/:id/turn" },
      params: { id: "enc-1" },
    };
    const unrelated: FakeRequest = {
      method: "POST",
      path: "/game/sessions",
      route: { path: "/game/sessions" },
      params: {},
      body: { name: "x" },
    };

    await firstValueFrom(interceptor.intercept(ctx(read), handler(OK)));
    await firstValueFrom(interceptor.intercept(ctx(unrelated), handler(OK)));

    // Nenhum dos dois deve ter deixado lock preso no encontro.
    const after = await firstValueFrom(
      interceptor.intercept(ctx(attackRequest("enc-1")), handler(OK)),
    );
    expect(after).toBe(OK);
  });

  it("nao intercepta contexto que nao e http", async () => {
    const result = await firstValueFrom(
      interceptor.intercept(ctx(attackRequest("enc-1"), "ws"), handler(OK)),
    );
    expect(result).toBe(OK);
  });
});
