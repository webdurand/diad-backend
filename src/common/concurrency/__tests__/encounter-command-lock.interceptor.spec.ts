import { ConflictException } from "@nestjs/common";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import { delay } from "rxjs/operators";
import {
  EncounterCommandLockInterceptor,
  __resetEncounterCommandLockForTests,
} from "../encounter-command-lock.interceptor";

type FakeRequest = {
  method: string;
  path: string;
  originalUrl?: string;
  route?: { path: string };
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

function conflictCode(run: () => unknown): string {
  try {
    run();
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
    const code = conflictCode(() =>
      interceptor.intercept(ctx(req), secondHandler as unknown as CallHandler),
    );

    expect(code).toBe("COMMAND_IN_PROGRESS");
    expect(secondHandler.handle).not.toHaveBeenCalled();

    await inFlight;
  });

  it("rejeita com 409 ENCOUNTER_BUSY outro comando concorrente no mesmo encontro", async () => {
    const inFlight = firstValueFrom(
      interceptor.intercept(ctx(attackRequest("enc-1")), handler(OK, 30)),
    );

    const otherCommand: FakeRequest = {
      method: "POST",
      path: "/game/encounters/enc-1/end-turn",
      originalUrl: "/game/encounters/enc-1/end-turn",
      route: { path: "/game/encounters/:id/end-turn" },
      params: { id: "enc-1" },
      body: {},
    };

    expect(() => interceptor.intercept(ctx(otherCommand), handler(OK))).toThrow(
      ConflictException,
    );
    expect(
      conflictCode(() => interceptor.intercept(ctx(otherCommand), handler(OK))),
    ).toBe("ENCOUNTER_BUSY");

    await inFlight;
  });

  it("nao confunde comandos que diferem so em path param (remover participante A vs B)", async () => {
    const secondHandler = { handle: jest.fn(() => of(OK)) };

    const inFlight = firstValueFrom(
      interceptor.intercept(
        ctx(removeParticipantRequest("enc-1", "p-A")),
        handler(OK, 30),
      ),
    );

    // Corpo idêntico (vazio) e mesmo padrão de rota: com hash sobre o padrão
    // isto era tratado como duplicata e a remoção de B era descartada em
    // silêncio. Agora tem de ser ENCOUNTER_BUSY, não COMMAND_IN_PROGRESS.
    expect(
      conflictCode(() =>
        interceptor.intercept(
          ctx(removeParticipantRequest("enc-1", "p-B")),
          secondHandler as unknown as CallHandler,
        ),
      ),
    ).toBe("ENCOUNTER_BUSY");

    await inFlight;
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

  it("libera o lock mesmo quando o handler falha", async () => {
    const failing: CallHandler = {
      handle: () => {
        throw new Error("boom");
      },
    };

    expect(() =>
      interceptor.intercept(ctx(attackRequest("enc-1")), failing),
    ).toThrow("boom");

    const after = await firstValueFrom(
      interceptor.intercept(ctx(attackRequest("enc-1")), handler(OK)),
    );
    expect(after).toBe(OK);
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
