import type { Response } from "express";
import {
  AiProxyController,
  __resetIdempotencyForTests,
} from "./ai-proxy.controller";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

/**
 * Spec 027 (M1, AC1.12) — guard in-flight no controller pra rejeitar duplo
 * POST do mesmo turn (jogador clicando 2× muito rápido). Aqui testamos só
 * o comportamento do guard — `pipeStream` é mockado pra não bater no
 * agents real.
 */
describe("AiProxyController — idempotency guard (spec 027)", () => {
  const SESSION_ID = "00000000-0000-4000-8000-000000000010";
  const USER_ID = "00000000-0000-4000-8000-000000000020";

  function makeRes() {
    const writes: string[] = [];
    let statusCode: number | undefined;
    let ended = false;
    const res = {
      setHeader: jest.fn(),
      get statusCode() {
        return statusCode ?? 200;
      },
      set statusCode(v: number) {
        statusCode = v;
      },
      write: jest.fn((chunk: string) => {
        writes.push(typeof chunk === "string" ? chunk : String(chunk));
        return true;
      }),
      end: jest.fn(() => {
        ended = true;
      }),
      flush: jest.fn(),
    } as unknown as Response;
    return {
      res,
      writes,
      isEnded: () => ended,
      getStatusCode: () => statusCode,
    };
  }

  function makeController(opts: {
    pipeStream: jest.Mock;
    activeScene?: { id: string } | null;
    gameEventRepo?: { findOne: jest.Mock };
  }): AiProxyController {
    const aiProxyService: any = {
      pipeStream: opts.pipeStream,
      getServiceKey: () => "test-key",
    };
    const resumeService: any = {
      assemble: jest.fn().mockResolvedValue({
        campaignId: "c-1",
        isResumed: false,
        previousSessionId: undefined,
        sceneContext: { scene: { title: "x" } },
        recentMessages: [],
        previousSessionSummary: undefined,
        gapMinutes: 0,
        lastMessageMismatch: false,
        hotRecapTriggered: false,
        serverLastMessageId: 5,
      }),
    };
    const recapService: any = {};
    const sceneService: any = {
      getActive: jest.fn().mockResolvedValue(opts.activeScene ?? null),
    };
    const sessionMessageService: any = {
      append: jest.fn().mockResolvedValue({ id: "m-1", sequenceNumber: 6 }),
      getMaxSequenceNumber: jest.fn().mockResolvedValue(6),
    };
    // Spec 027 (M2 follow-up) — repo de game_events pra inject de
    // encounter_outcome_summary / fate_ladder_resolved em sceneContext.
    // Default: nenhum evento (controller passa adiante sem mescla).
    const gameEventRepo: any = opts.gameEventRepo ?? {
      findOne: jest.fn().mockResolvedValue(null),
    };
    return new AiProxyController(
      aiProxyService,
      resumeService,
      recapService,
      sceneService,
      sessionMessageService,
      gameEventRepo,
    );
  }

  beforeEach(() => {
    __resetIdempotencyForTests();
  });

  it("narrativeTurn: segundo POST idêntico em paralelo recebe 409 IDEMPOTENCY_CACHE_MISS_AFTER_RACE", async () => {
    // pipeStream "trava" até liberarmos manualmente via resolver.
    let resolveFirst: () => void;
    const firstDone = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const pipeStream = jest.fn(async () => {
      await firstDone;
    });

    const controller = makeController({ pipeStream });
    const body = {
      playerInput: "atacar goblin",
      lastMessageId: 5,
      clientId: "entry-3",
    };
    const req: any = { user: { id: USER_ID } };

    const r1 = makeRes();
    const r2 = makeRes();

    // Dispara o primeiro turn — fica preso no pipeStream.
    const first = controller.narrativeTurn(SESSION_ID, body, req, r1.res);

    // Aguarda o microtask drenar pra que o primeiro tenha entrado no try{}
    // e adquirido a chave antes do segundo bater.
    await Promise.resolve();
    await Promise.resolve();

    // Dispara o segundo turn IDÊNTICO — deve falhar com 409 e retornar
    // imediatamente, sem chamar pipeStream.
    await controller.narrativeTurn(SESSION_ID, body, req, r2.res);

    expect(r2.getStatusCode()).toBe(409);
    expect(r2.isEnded()).toBe(true);
    const out = r2.writes.join("");
    expect(out).toContain(ErrorCode.IDEMPOTENCY_CACHE_MISS_AFTER_RACE);

    // Libera o primeiro pra finalizar.
    resolveFirst!();
    await first;

    // O primeiro chamou pipeStream uma vez; o segundo NUNCA chamou.
    expect(pipeStream).toHaveBeenCalledTimes(1);

    // Após o finally do primeiro, a chave foi liberada — terceiro POST
    // idêntico (sequencial agora) deve voltar a passar.
    const r3 = makeRes();
    let resolveThird: () => void;
    const thirdDone = new Promise<void>((resolve) => {
      resolveThird = resolve;
    });
    pipeStream.mockImplementationOnce(async () => {
      await thirdDone;
    });
    const third = controller.narrativeTurn(SESSION_ID, body, req, r3.res);
    await Promise.resolve();
    resolveThird!();
    await third;
    expect(pipeStream).toHaveBeenCalledTimes(2);
  });

  it("narrativeTurn: turns sequenciais com lastMessageId diferentes NÃO colidem", async () => {
    const pipeStream = jest.fn(async () => {
      // Resolve imediato — não trava.
    });
    const controller = makeController({ pipeStream });
    const req: any = { user: { id: USER_ID } };

    const r1 = makeRes();
    await controller.narrativeTurn(
      SESSION_ID,
      { playerInput: "ação 1", lastMessageId: 5 },
      req,
      r1.res,
    );

    const r2 = makeRes();
    await controller.narrativeTurn(
      SESSION_ID,
      { playerInput: "ação 2", lastMessageId: 7 },
      req,
      r2.res,
    );

    // Nenhum dos dois recebe 409.
    expect(r1.getStatusCode()).not.toBe(409);
    expect(r2.getStatusCode()).not.toBe(409);
    expect(pipeStream).toHaveBeenCalledTimes(2);
  });

  it("narrativeStart: duplo POST em paralelo recebe 409", async () => {
    let resolveFirst: () => void;
    const firstDone = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const pipeStream = jest.fn(async () => {
      await firstDone;
    });

    const controller = makeController({ pipeStream });
    const req: any = { user: { id: USER_ID } };

    const r1 = makeRes();
    const r2 = makeRes();

    const first = controller.narrativeStart(SESSION_ID, {}, req, r1.res);
    await Promise.resolve();
    await Promise.resolve();

    await controller.narrativeStart(SESSION_ID, {}, req, r2.res);

    expect(r2.getStatusCode()).toBe(409);
    expect(r2.writes.join("")).toContain(
      ErrorCode.IDEMPOTENCY_CACHE_MISS_AFTER_RACE,
    );
    expect(pipeStream).toHaveBeenCalledTimes(1);

    resolveFirst!();
    await first;
  });

  it("narrativeTurn: chave é liberada no finally mesmo se pipeStream lançar", async () => {
    const pipeStream = jest
      .fn()
      .mockRejectedValueOnce(new Error("agents down"))
      .mockResolvedValueOnce(undefined);

    const controller = makeController({ pipeStream });
    const req: any = { user: { id: USER_ID } };
    const body = { playerInput: "ação 1", lastMessageId: 5 };

    const r1 = makeRes();
    // O controller já trata erro internamente (catch), portanto não rejeita.
    await controller.narrativeTurn(SESSION_ID, body, req, r1.res);

    // Mesma chave novamente — chave foi liberada no finally do primeiro.
    const r2 = makeRes();
    await controller.narrativeTurn(SESSION_ID, body, req, r2.res);

    expect(r2.getStatusCode()).not.toBe(409);
    expect(pipeStream).toHaveBeenCalledTimes(2);
  });

  // ─── Spec 027 (M2 follow-up) — systemHint event injection ───

  describe("narrativeTurn: systemHint event injection", () => {
    it("post_combat: injeta encounter_outcome_summary em sceneContext.recent_events", async () => {
      const pipeStream = jest.fn(async () => {});
      const eventPayload = {
        outcome: "victory",
        defeatedNpcs: [{ name: "Goblin Capanga", type: "monster" }],
        xpAwarded: 50,
        gold: { cp: 0, sp: 0, gp: 30, pp: 0 },
        items: [],
        pcFinalHp: { characterId: "c1", current: 6, max: 22, percent: 27 },
        summary: "Inimigos derrotados: Goblin Capanga. PC 27%HP. Recompensa: 50XP, 30gp.",
      };
      const findOne = jest.fn().mockResolvedValue({
        sequence: 42,
        eventType: "encounter_outcome_summary",
        sessionId: SESSION_ID,
        data: eventPayload,
      });
      const controller = makeController({
        pipeStream,
        gameEventRepo: { findOne },
      });

      const req: any = { user: { id: USER_ID } };
      const r = makeRes();
      await controller.narrativeTurn(
        SESSION_ID,
        {
          playerInput: "",
          systemHint: "post_combat",
          lastMessageId: 5,
        },
        req,
        r.res,
      );

      expect(findOne).toHaveBeenCalledWith({
        where: {
          sessionId: SESSION_ID,
          eventType: "encounter_outcome_summary",
        },
        order: { sequence: "DESC" },
      });
      expect(pipeStream).toHaveBeenCalledTimes(1);
      const proxiedBody = pipeStream.mock.calls[0][1];
      expect(proxiedBody.systemHint).toBe("post_combat");
      const recent = proxiedBody.sceneContext.recent_events;
      expect(Array.isArray(recent)).toBe(true);
      expect(recent[recent.length - 1]).toEqual({
        type: "encounter_outcome_summary",
        payload: eventPayload,
      });
    });

    it("post_fate_choice: injeta fate_ladder_resolved", async () => {
      const pipeStream = jest.fn(async () => {});
      const fatePayload = {
        characterId: "c1",
        ladderId: "ladder-1",
        chosenOption: "C",
        outcome: { description: "amnesia parcial" },
        pcFinalState: {
          current_hp: 1,
          max_hp_bonus: 0,
          conditions: ["unconscious"],
          dyingState: "stable",
        },
      };
      const findOne = jest.fn().mockResolvedValue({
        sequence: 99,
        eventType: "fate_ladder_resolved",
        sessionId: SESSION_ID,
        data: fatePayload,
      });
      const controller = makeController({
        pipeStream,
        gameEventRepo: { findOne },
      });

      const r = makeRes();
      await controller.narrativeTurn(
        SESSION_ID,
        {
          playerInput: "",
          systemHint: "post_fate_choice",
          lastMessageId: 6,
        },
        { user: { id: USER_ID } } as any,
        r.res,
      );

      expect(findOne).toHaveBeenCalledWith({
        where: { sessionId: SESSION_ID, eventType: "fate_ladder_resolved" },
        order: { sequence: "DESC" },
      });
      const recent =
        pipeStream.mock.calls[0][1].sceneContext.recent_events;
      expect(recent[recent.length - 1]).toEqual({
        type: "fate_ladder_resolved",
        payload: fatePayload,
      });
    });

    it("systemHint sem evento correspondente: forwarded sem mescla, não erra", async () => {
      const pipeStream = jest.fn(async () => {});
      const findOne = jest.fn().mockResolvedValue(null);
      const controller = makeController({
        pipeStream,
        gameEventRepo: { findOne },
      });

      await controller.narrativeTurn(
        SESSION_ID,
        {
          playerInput: "",
          systemHint: "post_combat",
          lastMessageId: 7,
        },
        { user: { id: USER_ID } } as any,
        makeRes().res,
      );

      // findOne foi chamado mas não retornou nada — não adiciona em recent_events.
      expect(findOne).toHaveBeenCalledTimes(1);
      const proxied = pipeStream.mock.calls[0][1];
      // sceneContext.recent_events não deve conter encounter_outcome_summary.
      const recent = proxied.sceneContext?.recent_events ?? [];
      expect(
        recent.some((e: any) => e.type === "encounter_outcome_summary"),
      ).toBe(false);
    });

    it("sem systemHint: query nem é executada", async () => {
      const pipeStream = jest.fn(async () => {});
      const findOne = jest.fn();
      const controller = makeController({
        pipeStream,
        gameEventRepo: { findOne },
      });

      await controller.narrativeTurn(
        SESSION_ID,
        { playerInput: "atacar", lastMessageId: 8 },
        { user: { id: USER_ID } } as any,
        makeRes().res,
      );

      expect(findOne).not.toHaveBeenCalled();
    });

    it("systemHint não-mapeado: forwarded sem touch no DB", async () => {
      const pipeStream = jest.fn(async () => {});
      const findOne = jest.fn();
      const controller = makeController({
        pipeStream,
        gameEventRepo: { findOne },
      });

      await controller.narrativeTurn(
        SESSION_ID,
        {
          playerInput: "",
          systemHint: "unknown_hint",
          lastMessageId: 9,
        },
        { user: { id: USER_ID } } as any,
        makeRes().res,
      );

      expect(findOne).not.toHaveBeenCalled();
      expect(pipeStream.mock.calls[0][1].systemHint).toBe("unknown_hint");
    });

    it("query falha: stream segue, evento não é injetado", async () => {
      const pipeStream = jest.fn(async () => {});
      const findOne = jest
        .fn()
        .mockRejectedValue(new Error("DB unreachable"));
      const controller = makeController({
        pipeStream,
        gameEventRepo: { findOne },
      });

      await controller.narrativeTurn(
        SESSION_ID,
        {
          playerInput: "",
          systemHint: "post_combat",
          lastMessageId: 10,
        },
        { user: { id: USER_ID } } as any,
        makeRes().res,
      );

      // pipeStream ainda foi chamado — best-effort não derruba turn.
      expect(pipeStream).toHaveBeenCalledTimes(1);
      const recent =
        pipeStream.mock.calls[0][1].sceneContext?.recent_events ?? [];
      expect(
        recent.some((e: any) => e.type === "encounter_outcome_summary"),
      ).toBe(false);
    });
  });
});
