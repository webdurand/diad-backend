import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of, throwError } from "rxjs";
import { CommandSnapshotInterceptor } from "../command-snapshot.interceptor";
import type { CommandSnapshotService } from "../../services/command-snapshot.service";
import type { RealtimeService } from "src/realtime/realtime.service";
import { ClientIdContext } from "src/common/http/client-id.context";
import { FakeClsService } from "src/common/request-cache/__tests__/fake-cls";

type FakeRequest = {
  method: string;
  path: string;
  route?: { path: string };
  params?: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
};

function ctx(req: FakeRequest, type: "http" | "ws" = "http"): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function handler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

function attackRequest(
  encounterId = "enc-1",
  headers: Record<string, string> = {},
): FakeRequest {
  return {
    method: "POST",
    path: `/game/encounters/${encounterId}/attack`,
    route: { path: "/game/encounters/:id/attack" },
    params: { id: encounterId },
    headers,
  };
}

const SNAPSHOT = {
  encounter: { id: "enc-1", participants: [] },
  turn: null,
  events: [],
  at: "2026-07-27T00:00:00.000Z",
};

function build(
  snapshot: unknown = SNAPSHOT,
): {
  interceptor: CommandSnapshotInterceptor;
  snapshots: { build: jest.Mock };
  realtime: { emitToRoom: jest.Mock };
  clientIdContext: ClientIdContext;
} {
  const snapshots = { build: jest.fn().mockResolvedValue(snapshot) };
  const realtime = { emitToRoom: jest.fn() };
  // ClientIdContext real sobre um CLS de mentira ativo: o interceptor publica o
  // header no contexto para que `emitEncounterInvalidate` também o veja.
  const clientIdContext = new ClientIdContext(
    new FakeClsService(true) as never,
  );
  const interceptor = new CommandSnapshotInterceptor(
    snapshots as unknown as CommandSnapshotService,
    realtime as unknown as RealtimeService,
    clientIdContext,
  );
  return { interceptor, snapshots, realtime, clientIdContext };
}

describe("CommandSnapshotInterceptor", () => {
  it("anexa o snapshot na resposta de sucesso e faz broadcast na sala", async () => {
    const { interceptor, snapshots, realtime } = build();
    const body = { ok: true, value: { hit: true }, events: [] };

    const out = await firstValueFrom(
      interceptor.intercept(
        ctx(attackRequest("enc-1", { "x-client-id": "tab-a" })),
        handler(body),
      ),
    );

    expect(snapshots.build).toHaveBeenCalledWith("enc-1");
    expect(out).toMatchObject({ ok: true, snapshot: SNAPSHOT });
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      "encounter:enc-1",
      "encounter:snapshot",
      { encounterId: "enc-1", originClientId: "tab-a", snapshot: SNAPSHOT },
    );
  });

  it("nao vaza o corpo original: mantem value e events intactos", async () => {
    const { interceptor } = build();
    const body = { ok: true, value: { damage: 7 }, events: [{ x: 1 }] };

    const out = (await firstValueFrom(
      interceptor.intercept(ctx(attackRequest()), handler(body)),
    )) as Record<string, unknown>;

    expect(out.value).toEqual({ damage: 7 });
    expect(out.events).toEqual([{ x: 1 }]);
  });

  it("ignora falha de dominio (ok:false) sem montar snapshot", async () => {
    const { interceptor, snapshots, realtime } = build();
    const body = { ok: false, code: "NOT_YOUR_TURN", error: "x" };

    const out = await firstValueFrom(
      interceptor.intercept(ctx(attackRequest()), handler(body)),
    );

    expect(out).toBe(body);
    expect(snapshots.build).not.toHaveBeenCalled();
    expect(realtime.emitToRoom).not.toHaveBeenCalled();
  });

  it("devolve o corpo original quando o snapshot falha", async () => {
    const { interceptor, realtime } = build(null);
    const body = { ok: true, value: {}, events: [] };

    const out = await firstValueFrom(
      interceptor.intercept(ctx(attackRequest()), handler(body)),
    );

    expect(out).toBe(body);
    expect(realtime.emitToRoom).not.toHaveBeenCalled();
  });

  it("nao toca leituras (GET) nem rotas fora de encounters/:id", async () => {
    const { interceptor, snapshots } = build();

    const read: FakeRequest = {
      method: "GET",
      path: "/game/encounters/enc-1",
      route: { path: "/game/encounters/:id" },
      params: { id: "enc-1" },
      headers: {},
    };
    const unrelated: FakeRequest = {
      method: "POST",
      path: "/game/sessions",
      route: { path: "/game/sessions" },
      params: {},
      headers: {},
    };

    await firstValueFrom(
      interceptor.intercept(ctx(read), handler({ ok: true, value: {} })),
    );
    await firstValueFrom(
      interceptor.intercept(ctx(unrelated), handler({ ok: true, value: {} })),
    );

    expect(snapshots.build).not.toHaveBeenCalled();
  });

  it("propaga erro do handler sem montar snapshot", async () => {
    const { interceptor, snapshots } = build();
    const failing: CallHandler = {
      handle: () => throwError(() => new Error("boom")),
    };

    await expect(
      firstValueFrom(interceptor.intercept(ctx(attackRequest()), failing)),
    ).rejects.toThrow("boom");
    expect(snapshots.build).not.toHaveBeenCalled();
  });

  it("originClientId fica null quando o header nao vem", async () => {
    const { interceptor, realtime } = build();

    await firstValueFrom(
      interceptor.intercept(
        ctx(attackRequest("enc-2")),
        handler({ ok: true, value: {}, events: [] }),
      ),
    );

    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      "encounter:enc-2",
      "encounter:snapshot",
      expect.objectContaining({ originClientId: null }),
    );
  });
});
