import type { Response } from "express";
import {
  AiProxyController,
  __resetIdempotencyForTests,
} from "./ai-proxy.controller";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

interface ProxiedNarrativeBody {
  systemHint?: string;
  sceneContext?: {
    sceneId?: string;
    recent_events?: Array<{ type: string; payload?: unknown }>;
  };
}

type PipeStreamMock = jest.Mock<
  Promise<void>,
  [
    string,
    ProxiedNarrativeBody,
    Response,
    ((chunk: Buffer) => void)?,
    (() => Promise<void> | void)?,
    Record<string, string>?,
  ]
>;

function makePipeStream(
  impl: PipeStreamMock["mockImplementation"] extends (fn: infer Fn) => unknown
    ? Fn
    : never = async () => undefined,
): PipeStreamMock {
  return jest.fn(impl) as PipeStreamMock;
}

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
    pipeStream: PipeStreamMock;
    activeScene?: { id: string } | null;
    sceneService?: { getActive: jest.Mock };
    gameEventRepo?: { findOne: jest.Mock };
    sessionMessageService?: {
      append?: jest.Mock;
      getMaxSequenceNumber?: jest.Mock;
      findByClientId?: jest.Mock;
    };
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
        activeSceneId: opts.activeScene?.id ?? null,
        recentMessages: [],
        previousSessionSummary: undefined,
        gapMinutes: 0,
        lastMessageMismatch: false,
        hotRecapTriggered: false,
        serverLastMessageId: 5,
      }),
    };
    const recapService: any = {};
    const sceneService: any = opts.sceneService ?? {
      getActive: jest.fn().mockResolvedValue(opts.activeScene ?? null),
    };
    const sessionMessageService: any = {
      append: jest.fn().mockResolvedValue({ id: "m-1", sequenceNumber: 6 }),
      getMaxSequenceNumber: jest.fn().mockResolvedValue(6),
      findByClientId: jest.fn().mockResolvedValue(null),
      ...(opts.sessionMessageService ?? {}),
    };
    // Spec 027 (M2 follow-up) — repo de game_events pra inject de
    // encounter_outcome_summary / fate_ladder_resolved em sceneContext.
    // Default: nenhum evento (controller passa adiante sem mescla).
    const gameEventRepo: any = opts.gameEventRepo ?? {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const pendingGuardRepo: any = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const startEncounterFromNarrative: any = {
      run: jest.fn().mockResolvedValue({
        encounterId: "enc-1",
        participantIds: [],
      }),
    };
    return new AiProxyController(
      aiProxyService,
      resumeService,
      recapService,
      sceneService,
      sessionMessageService,
      gameEventRepo,
      pendingGuardRepo,
      startEncounterFromNarrative,
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
    const pipeStream = makePipeStream(async () => {
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
    const pipeStream = makePipeStream();
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

  it("narrativeTurn: emite status imediatamente antes do passthrough", async () => {
    const sceneService = {
      getActive: jest.fn().mockResolvedValue({ id: "scene-from-old-path" }),
    };
    const r = makeRes();
    const pipeStream = makePipeStream(async (_path, body) => {
      expect(r.writes[0]).toContain('"type":"status"');
      expect(r.writes[0]).toContain("Recolhendo memórias da cena");
      expect(body.sceneContext).toMatchObject({ sceneId: "scene-from-resume" });
    });
    const controller = makeController({
      pipeStream,
      activeScene: { id: "scene-from-resume" },
      sceneService,
    });
    const req: any = { user: { id: USER_ID } };

    await controller.narrativeTurn(
      SESSION_ID,
      { playerInput: "abrir a porta", lastMessageId: 5 },
      req,
      r.res,
    );

    expect((r.res as any).flush).toHaveBeenCalled();
    expect(sceneService.getActive).not.toHaveBeenCalled();
  });

  it("narrativeStart: duplo POST em paralelo recebe 409", async () => {
    let resolveFirst: () => void;
    const firstDone = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const pipeStream = makePipeStream(async () => {
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

  it("narrativeStart: emite status antes de chamar agents", async () => {
    const r = makeRes();
    const pipeStream = makePipeStream(async () => {
      expect(r.writes[0]).toContain('"type":"status"');
      expect(r.writes[0]).toContain("Recolhendo memórias da cena");
    });
    const controller = makeController({ pipeStream });
    const req: any = { user: { id: USER_ID } };

    await controller.narrativeStart(SESSION_ID, {}, req, r.res);

    expect((r.res as any).flush).toHaveBeenCalled();
    expect(pipeStream).toHaveBeenCalledTimes(1);
  });

  it("narrativeTurn: chave é liberada no finally mesmo se pipeStream lançar", async () => {
    const pipeStream = jest.fn(
      async () => undefined,
    ) as unknown as PipeStreamMock;
    pipeStream
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
      const pipeStream = makePipeStream();
      const eventPayload = {
        outcome: "victory",
        defeatedNpcs: [{ name: "Goblin Capanga", type: "monster" }],
        xpAwarded: 50,
        gold: { cp: 0, sp: 0, gp: 30, pp: 0 },
        items: [],
        pcFinalHp: { characterId: "c1", current: 6, max: 22, percent: 27 },
        summary:
          "Inimigos derrotados: Goblin Capanga. PC 27%HP. Recompensa: 50XP, 30gp.",
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
      const recent = proxiedBody.sceneContext?.recent_events ?? [];
      expect(Array.isArray(recent)).toBe(true);
      expect(recent[recent.length - 1]).toEqual({
        type: "encounter_outcome_summary",
        payload: eventPayload,
      });
    });

    it("post_fate_choice: injeta fate_ladder_resolved", async () => {
      const pipeStream = makePipeStream();
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
        pipeStream.mock.calls[0][1].sceneContext?.recent_events ?? [];
      expect(recent[recent.length - 1]).toEqual({
        type: "fate_ladder_resolved",
        payload: fatePayload,
      });
    });

    it("systemHint sem evento correspondente: forwarded sem mescla, não erra", async () => {
      const pipeStream = makePipeStream();
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

      // findOne é chamado 2x quando systemHint='post_combat':
      //   1) findLatestEncounterId(eventType='encounter_resolved')
      //   2) injectSystemHintEvent(eventType='encounter_outcome_summary')
      // Ambas retornam null aqui — nenhuma resolve em mescla.
      expect(findOne).toHaveBeenCalledTimes(2);
      const proxied = pipeStream.mock.calls[0][1];
      const recent = proxied.sceneContext?.recent_events ?? [];
      expect(
        recent.some((e: any) => e.type === "encounter_outcome_summary"),
      ).toBe(false);
    });

    it("sem systemHint: query nem é executada", async () => {
      const pipeStream = makePipeStream();
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
      const pipeStream = makePipeStream();
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
      const pipeStream = makePipeStream();
      const findOne = jest.fn().mockRejectedValue(new Error("DB unreachable"));
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

  // Idempotência F5 do post_combat — quando a narração pós-combate já foi
  // persistida (clientId determinístico por encounterId), o segundo POST
  // retorna do histórico sem chamar o agent.
  describe("narrativeTurn: post_combat F5 idempotency", () => {
    it("post_combat: narração já persistida → não chama agent, emite session_sync + done", async () => {
      const pipeStream = makePipeStream();
      const findOne = jest.fn().mockImplementation((opts: any) => {
        if (opts.where?.eventType === "encounter_resolved") {
          return Promise.resolve({
            sequence: 50,
            data: {},
            encounterId: "enc-abc",
          });
        }
        return Promise.resolve(null);
      });
      const findByClientId = jest.fn().mockResolvedValue({
        id: "msg-99",
        clientId: "srv-narr-post-combat-enc-abc",
        kind: "narration",
        content: "old narration",
      });

      const controller = makeController({
        pipeStream,
        gameEventRepo: { findOne },
        sessionMessageService: { findByClientId },
      });

      const r = makeRes();
      await controller.narrativeTurn(
        SESSION_ID,
        {
          playerInput: "",
          systemHint: "post_combat",
          lastMessageId: 100,
        },
        { user: { id: USER_ID } } as any,
        r.res,
      );

      // Não chama o agent (idempotência ativou).
      expect(pipeStream).not.toHaveBeenCalled();
      expect(findByClientId).toHaveBeenCalledWith(
        SESSION_ID,
        "srv-narr-post-combat-enc-abc",
      );
      // Emite narration_persisted (com clientId existente) + session_sync + done.
      const writeStr = r.writes.join("");
      expect(writeStr).toContain("narration_persisted");
      expect(writeStr).toContain("session_sync");
      expect(writeStr).toContain('"type":"done"');
      expect(r.isEnded()).toBe(true);
    });

    it("post_combat: sem narração persistida → chama agent normalmente com clientId determinístico", async () => {
      const pipeStream = makePipeStream();
      const findOne = jest.fn().mockImplementation((opts: any) => {
        if (opts.where?.eventType === "encounter_resolved") {
          return Promise.resolve({
            sequence: 50,
            data: {},
            encounterId: "enc-abc",
          });
        }
        return Promise.resolve(null);
      });
      const findByClientId = jest.fn().mockResolvedValue(null);

      const controller = makeController({
        pipeStream,
        gameEventRepo: { findOne },
        sessionMessageService: { findByClientId },
      });

      await controller.narrativeTurn(
        SESSION_ID,
        {
          playerInput: "",
          systemHint: "post_combat",
          lastMessageId: 100,
        },
        { user: { id: USER_ID } } as any,
        makeRes().res,
      );

      // Agent foi chamado normalmente.
      expect(pipeStream).toHaveBeenCalledTimes(1);
      // Lookup de existente foi feito mesmo assim (defesa contra race).
      expect(findByClientId).toHaveBeenCalledWith(
        SESSION_ID,
        "srv-narr-post-combat-enc-abc",
      );
    });

    it("post_combat: sem encounter_resolved no histórico → segue fluxo normal sem clientId determinístico", async () => {
      const pipeStream = makePipeStream();
      const findOne = jest.fn().mockResolvedValue(null);
      const findByClientId = jest.fn();

      const controller = makeController({
        pipeStream,
        gameEventRepo: { findOne },
        sessionMessageService: { findByClientId },
      });

      await controller.narrativeTurn(
        SESSION_ID,
        {
          playerInput: "",
          systemHint: "post_combat",
          lastMessageId: 100,
        },
        { user: { id: USER_ID } } as any,
        makeRes().res,
      );

      expect(pipeStream).toHaveBeenCalledTimes(1);
      // Sem encounterId, lookup do clientId determinístico não roda.
      expect(findByClientId).not.toHaveBeenCalled();
    });
  });
});
