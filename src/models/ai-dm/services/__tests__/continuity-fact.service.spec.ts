import { ContinuityFactService } from "../continuity-fact.service";

describe("ContinuityFactService", () => {
  const SESSION_ID = "11111111-1111-4111-8111-111111111111";
  const NPC_ID = "22222222-2222-4222-8222-222222222222";

  function makeService() {
    const factRepo = {
      create: jest.fn((entity: unknown) => entity),
      save: jest.fn((entity: object) =>
        Promise.resolve({
          ...entity,
          id: "fact-1",
          createdAt: new Date("2026-05-12T10:00:00Z"),
        }),
      ),
      findOne: jest.fn(() => Promise.resolve(null)),
      find: jest.fn(() => Promise.resolve([])),
    };
    const sessionRepo = {
      findOne: jest.fn(() => Promise.resolve({ id: SESSION_ID })),
    };
    const npcStateRepo = {
      create: jest.fn((entity: unknown) => entity),
      findOne: jest.fn(() => Promise.resolve(null)),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
    const sceneContextCache = {
      invalidateAll: jest.fn(),
    };

    const svc = new ContinuityFactService(
      factRepo as never,
      sessionRepo as never,
      npcStateRepo as never,
      sceneContextCache as never,
    );
    return { svc, factRepo, sessionRepo, npcStateRepo, sceneContextCache };
  }

  it("persiste fato normalizado sem resolver nomes como UUID", async () => {
    const { svc, factRepo } = makeService();
    await svc.create(SESSION_ID, {
      factType: "clue_found",
      entityType: "npc",
      entityId: "Vitorino",
      summary: "Vitorino sabia do roubo da praia.",
      confidence: 1.7,
      salience: 99,
      tags: ["roubo", " roubo ", "praia"],
      metadata: { source: "test" },
    });

    expect(factRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        factType: "clue_found",
        entityType: "npc",
        entityId: undefined,
        entityName: "Vitorino",
        confidence: 1,
        salience: 10,
        tags: ["roubo", "praia"],
      }),
    );
  });

  it("retorna duplicata ativa sem salvar de novo", async () => {
    const { svc, factRepo } = makeService();
    const duplicate = {
      id: "fact-existing",
      sessionId: SESSION_ID,
      factType: "open_thread",
      summary: "Há alguém escondido no armazém.",
    };
    factRepo.findOne.mockResolvedValueOnce(duplicate);

    const result = await svc.create(SESSION_ID, {
      factType: "open_thread",
      summary: "Há alguém escondido no armazém.",
    });

    expect(result).toBe(duplicate);
    expect(factRepo.save).not.toHaveBeenCalled();
  });

  it("aplica side-effect canônico de npc_death no SessionNpcState", async () => {
    const { svc, factRepo, npcStateRepo, sceneContextCache } = makeService();
    factRepo.save.mockResolvedValueOnce({
      id: "fact-1",
      sessionId: SESSION_ID,
      factType: "npc_death",
      entityId: NPC_ID,
      summary: "Vitorino morreu em combate.",
      salience: 10,
      createdAt: new Date("2026-05-12T10:00:00Z"),
    });

    await svc.create(SESSION_ID, {
      factType: "npc_death",
      entityType: "npc",
      entityId: NPC_ID,
      summary: "Vitorino morreu em combate.",
      salience: 10,
    });

    expect(npcStateRepo.create).toHaveBeenCalledWith({
      gameSessionId: SESSION_ID,
      npcId: NPC_ID,
      status: "dead",
    });
    expect(npcStateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "dead" }),
    );
    expect(sceneContextCache.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it("lista fatos relevantes boostando entidade e termos do input", async () => {
    const { svc, factRepo } = makeService();
    const old = new Date("2026-05-12T09:00:00Z");
    const recent = new Date("2026-05-12T10:00:00Z");
    factRepo.find.mockResolvedValueOnce([
      {
        id: "a",
        summary: "A praia tinha marcas de arrasto.",
        factType: "clue_found",
        entityId: null,
        entityName: "Praia",
        entityType: "location",
        tags: ["carga"],
        salience: 4,
        createdAt: recent,
      },
      {
        id: "b",
        summary: "Vitorino morreu e não pode aparecer novamente.",
        factType: "npc_death",
        entityId: NPC_ID,
        entityName: "Vitorino",
        entityType: "npc",
        tags: [],
        salience: 10,
        createdAt: old,
      },
    ]);

    const result = await svc.listRelevant(SESSION_ID, {
      limit: 2,
      entityIds: [NPC_ID],
      q: "cadê Vitorino e a carga?",
    });

    expect(result.map((f) => f.id)).toEqual(["b", "a"]);
  });
});
