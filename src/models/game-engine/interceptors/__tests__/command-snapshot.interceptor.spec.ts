import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { ClsService } from "nestjs-cls";
import { firstValueFrom, of, throwError } from "rxjs";
import { CommandSnapshotInterceptor } from "../command-snapshot.interceptor";
import type { CommandSnapshotService } from "../../services/command-snapshot.service";
import type { RealtimeService } from "src/realtime/realtime.service";
import { ClientIdContext } from "src/common/http/client-id.context";
import { FakeClsService } from "src/common/request-cache/__tests__/fake-cls";
import { recordDiceRollTrace } from "src/common/dice/dice-roll-trace.context";

type FakeRequest = {
  method: string;
  path: string;
  route?: { path: string | string[] };
  params?: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
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
  body: unknown = {},
): FakeRequest {
  return {
    method: "POST",
    path: `/game/encounters/${encounterId}/attack`,
    route: { path: "/game/encounters/:id/attack" },
    params: { id: encounterId },
    headers,
    body,
  };
}

const SNAPSHOT = {
  encounter: { id: "enc-1", participants: [] },
  turn: null,
  events: [],
  at: "2026-07-27T00:00:00.000Z",
};

function build(snapshot: unknown = SNAPSHOT): {
  interceptor: CommandSnapshotInterceptor;
  snapshots: { build: jest.Mock };
  realtime: { emitToRoom: jest.Mock };
  clientIdContext: ClientIdContext;
  cls: FakeClsService;
} {
  const snapshots = { build: jest.fn().mockResolvedValue(snapshot) };
  const realtime = { emitToRoom: jest.fn() };
  // ClientIdContext real sobre um CLS de mentira ativo: o interceptor publica o
  // header no contexto para que `emitEncounterInvalidate` também o veja.
  const cls = new FakeClsService(true);
  const clientIdContext = new ClientIdContext(cls as never);
  const interceptor = new CommandSnapshotInterceptor(
    snapshots as unknown as CommandSnapshotService,
    realtime as unknown as RealtimeService,
    clientIdContext,
    cls as unknown as ClsService,
  );
  return { interceptor, snapshots, realtime, clientIdContext, cls };
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

  it("emite os dados imediatamente e os inclui nos fallbacks de snapshot e HTTP", async () => {
    const { interceptor, realtime, cls } = build();
    const body = { ok: true, value: { hit: true }, events: [] };
    const rollingHandler: CallHandler = {
      handle: () => {
        recordDiceRollTrace(cls as unknown as ClsService, {
          expression: "2d20kh1+5",
          rolls: [9, 17],
          modifier: 5,
          total: 22,
          dropped: [9],
        });
        return of(body);
      },
    };

    const out = (await firstValueFrom(
      interceptor.intercept(
        ctx(
          attackRequest(
            "enc-1",
            {
              "x-client-id": "tab-a",
              "x-dice-command-id": "attack:123",
            },
            {
              attackerParticipantId: "hero-1",
              targetParticipantId: "monster-1",
            },
          ),
        ),
        rollingHandler,
      ),
    )) as Record<string, unknown>;

    const diceRolls = out.diceRolls as Array<Record<string, unknown>>;
    expect(diceRolls).toHaveLength(1);
    expect(diceRolls[0]).toMatchObject({
      commandId: "attack:123",
      visibility: "room",
      rollerParticipantIds: ["hero-1"],
      expression: "2d20kh1+5",
      rolls: [9, 17],
      modifier: 5,
      total: 22,
      dropped: [9],
    });
    expect(typeof diceRolls[0].id).toBe("string");

    expect(realtime.emitToRoom).toHaveBeenNthCalledWith(
      1,
      "encounter:enc-1",
      "encounter:dice-rolls",
      {
        encounterId: "enc-1",
        originClientId: "tab-a",
        diceRolls,
      },
    );
    expect(realtime.emitToRoom).toHaveBeenNthCalledWith(
      2,
      "encounter:enc-1",
      "encounter:snapshot",
      {
        encounterId: "enc-1",
        originClientId: "tab-a",
        snapshot: SNAPSHOT,
        diceRolls,
      },
    );
  });

  it("preserva os dados no fallback HTTP quando o snapshot nao pode ser montado", async () => {
    const { interceptor, realtime, cls } = build(null);
    const rollingHandler: CallHandler = {
      handle: () => {
        recordDiceRollTrace(cls as unknown as ClsService, {
          expression: "1d20+4",
          rolls: [13],
          modifier: 4,
          total: 17,
        });
        return of({ ok: true, value: { hit: true }, events: [] });
      },
    };

    const out = (await firstValueFrom(
      interceptor.intercept(ctx(attackRequest()), rollingHandler),
    )) as Record<string, unknown>;

    expect(out).not.toHaveProperty("snapshot");
    expect(out.diceRolls).toEqual([
      expect.objectContaining({
        expression: "1d20+4",
        rolls: [13],
        modifier: 4,
        total: 17,
      }),
    ]);
    expect(realtime.emitToRoom).toHaveBeenCalledTimes(1);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      "encounter:enc-1",
      "encounter:dice-rolls",
      expect.objectContaining({ diceRolls: out.diceRolls }),
    );
  });

  it("aceita route.path em array para apply-damage", async () => {
    const { interceptor, realtime, cls } = build();
    const req: FakeRequest = {
      method: "POST",
      path: "/game/encounters/enc-1/apply-damage",
      route: {
        path: [
          "/game/encounters/:id/damage",
          "/game/encounters/:id/apply-damage",
        ],
      },
      params: { id: "enc-1" },
      headers: {},
    };
    const rollingHandler: CallHandler = {
      handle: () => {
        recordDiceRollTrace(cls as unknown as ClsService, {
          expression: "2d8",
          rolls: [5, 7],
          modifier: 0,
          total: 12,
        });
        return of({ ok: true, value: {}, events: [] });
      },
    };

    const out = (await firstValueFrom(
      interceptor.intercept(ctx(req), rollingHandler),
    )) as Record<string, unknown>;

    expect(out.diceRolls).toEqual([
      expect.objectContaining({ expression: "2d8", rolls: [5, 7] }),
    ]);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      "encounter:enc-1",
      "encounter:dice-rolls",
      expect.objectContaining({
        diceRolls: [
          expect.objectContaining({ expression: "2d8", rolls: [5, 7] }),
        ],
      }),
    );
  });

  it.each([
    ["turno da IA", "/game/encounters/:id/ai-turn"],
    [
      "salvaguardas e recarga de fim/inicio de turno",
      "encounters/:id/end-turn",
    ],
    ["concentracao apos dano", "encounters/:id/damage"],
    ["efeitos persistentes durante movimento", "encounters/:id/move"],
    ["magia", "encounters/:id/cast-spell"],
    ["sustentacao de magia", "encounters/:id/spells/call-lightning/sustain"],
    ["feature central", "encounters/:id/class-feature"],
    [
      "reacao com dado",
      "encounters/:id/participants/:participantId/fighting-style/interception",
    ],
  ])("ativa trace publico para %s", async (_label, routePath) => {
    const { interceptor, realtime, cls } = build();
    const req: FakeRequest = {
      method: "POST",
      path: routePath.replace(":id", "enc-1"),
      route: { path: routePath },
      params: { id: "enc-1" },
      headers: {},
    };
    const rollingHandler: CallHandler = {
      handle: () => {
        recordDiceRollTrace(cls as unknown as ClsService, {
          expression: "1d20",
          rolls: [12],
          modifier: 0,
          total: 12,
        });
        return of({ ok: true, value: {}, events: [] });
      },
    };

    await firstValueFrom(interceptor.intercept(ctx(req), rollingHandler));

    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      "encounter:enc-1",
      "encounter:dice-rolls",
      expect.objectContaining({
        diceRolls: [
          expect.objectContaining({ expression: "1d20", rolls: [12] }),
        ],
      }),
    );
  });

  it("nao abre trace nem compartilha dados em rota secreta", async () => {
    const { interceptor, realtime, cls } = build();
    const req: FakeRequest = {
      method: "POST",
      path: "/game/encounters/enc-1/monsters",
      route: { path: "/game/encounters/:id/monsters" },
      params: { id: "enc-1" },
      headers: { "x-dice-command-id": "secret-roll" },
    };
    const secretHandler: CallHandler = {
      handle: () => {
        recordDiceRollTrace(cls as unknown as ClsService, {
          expression: "8d10",
          rolls: [7, 4, 8, 2, 10, 1, 3, 9],
          modifier: 0,
          total: 44,
        });
        return of({ ok: true, value: {}, events: [] });
      },
    };

    const out = (await firstValueFrom(
      interceptor.intercept(ctx(req), secretHandler),
    )) as Record<string, unknown>;

    expect(out).not.toHaveProperty("diceRolls");
    expect(realtime.emitToRoom).not.toHaveBeenCalledWith(
      "encounter:enc-1",
      "encounter:dice-rolls",
      expect.anything(),
    );
    expect(realtime.emitToRoom).toHaveBeenCalledTimes(1);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      "encounter:enc-1",
      "encounter:snapshot",
      expect.any(Object),
    );
    const emitted = realtime.emitToRoom.mock.calls as unknown as Array<
      [string, string, Record<string, unknown>]
    >;
    expect(emitted[0]?.[2]).not.toHaveProperty("diceRolls");
  });
});
