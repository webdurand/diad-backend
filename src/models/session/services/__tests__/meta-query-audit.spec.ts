import { MetaQueryService } from "../meta-query.service";
import { MetaQueryGuard } from "../meta-query-guard.service";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

const SESSION_ID = "00000000-0000-4000-8000-000000000044";
const SCENE_ID = "00000000-0000-4000-8000-000000000045";
const CHARACTER_ID = "00000000-0000-4000-8000-000000000046";

function buildService(opts: { existingAuditCount?: number } = {}) {
  const savedAudits: any[] = [];
  const manager = {
    findOne: jest.fn().mockResolvedValue({
      id: SCENE_ID,
      sessionId: SESSION_ID,
      title: "Beco estreito",
      description: "Um muro alto fecha a saída.",
    }),
    count: jest.fn().mockResolvedValue(opts.existingAuditCount ?? 0),
    create: jest.fn((_entity, row) => row),
    save: jest.fn(async (_entity, row) => {
      savedAudits.push(row);
      return row;
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (modeOrCb: any, maybeCb?: any) => {
      const cb = typeof modeOrCb === "function" ? modeOrCb : maybeCb;
      return cb(manager);
    }),
  };
  const sessionRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: SESSION_ID,
      characterIds: [CHARACTER_ID],
      config: { bimodalLoopEnabled: true },
    }),
  };
  const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
  const envelopeFactory = { build: jest.fn((input) => input) };
  const factResolver = {
    resolve: jest.fn().mockResolvedValue([
      {
        factId: "scene:wall",
        kind: "scene_observation",
        text: "Cena atual: um muro alto fecha a saída.",
        source: "scene_context",
        topics: ["muro", "alto", "saida"],
      },
      {
        factId: "pc_skill:acrobatics",
        kind: "pc_capability",
        text: "Skill do PC: Acrobatics (proficiente).",
        source: "character_sheet",
        topics: ["acrobatics", "skill", "teste"],
      },
    ]),
  };
  const outbound = {
    request: jest.fn().mockResolvedValue({
      answer: "O muro parece alto, mas sua agilidade dá base para tentar.",
      modelUsed: "claude-haiku-4-5-20251001",
    }),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === "AGENT_BASE_URL") return "http://agents.test";
      if (key === "INTERNAL_AGENTS_TOKEN") return "test-token";
      return undefined;
    }),
  };
  const service = new MetaQueryService(
    dataSource as any,
    sessionRepo as any,
    eventBus as any,
    envelopeFactory as any,
    new MetaQueryGuard(),
    factResolver as any,
    outbound as any,
    config as any,
  );
  return {
    service,
    dataSource,
    manager,
    eventBus,
    envelopeFactory,
    savedAudits,
    factResolver,
    outbound,
  };
}

describe("MetaQueryService", () => {
  it("persiste audit sem o texto da pergunta e decrementa contador", async () => {
    const { service, savedAudits, eventBus, outbound } = buildService();

    const result = await service.answer(SESSION_ID, {
      userId: "user-1",
      sceneId: SCENE_ID,
      question: "Posso pular o muro com Acrobatics?",
    });

    expect(result.remaining).toBe(2);
    expect(result.intentCategory).toBe("tactical_query");
    expect(result.answer).toContain("muro parece alto");
    expect(result.filteredFactsCount).toBe(2);
    expect(savedAudits[0]).toMatchObject({
      sessionId: SESSION_ID,
      sceneId: SCENE_ID,
      characterId: CHARACTER_ID,
      intentCategory: "tactical_query",
      filteredFactsCount: 2,
    });
    expect(savedAudits[0].questionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(savedAudits[0])).not.toContain("Acrobatics");
    expect(outbound.request).toHaveBeenCalledWith(
      "http://agents.test/internal/meta-query",
      expect.objectContaining({
        method: "POST",
        upstreamService: "diad-agents",
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "meta_query_invoked" }),
    );
  });

  it("usa transação serializable e lock pessimista na cena", async () => {
    const { service, dataSource, manager } = buildService();

    await service.answer(SESSION_ID, {
      userId: "user-1",
      sceneId: SCENE_ID,
      question: "o que minha percepção nota?",
    });

    expect(dataSource.transaction).toHaveBeenCalledWith(
      "SERIALIZABLE",
      expect.any(Function),
    );
    expect(manager.findOne).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        lock: { mode: "pessimistic_write" },
      }),
    );
  });

  it("rejeita a quarta pergunta na mesma cena", async () => {
    const { service } = buildService({ existingAuditCount: 3 });

    await expect(
      service.answer(SESSION_ID, {
        userId: "user-1",
        sceneId: SCENE_ID,
        question: "posso tentar escalar?",
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.META_QUERY_RATE_LIMIT_EXCEEDED,
    });
  });
});
