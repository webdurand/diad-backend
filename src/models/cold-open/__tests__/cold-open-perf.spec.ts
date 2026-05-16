import { GenerateColdOpenHookUseCase } from "../application/generate-cold-open-hook.use-case";
import { OPENING_ARCHETYPES } from "../domain/opening-archetype-catalog";

function repo(value: unknown) {
  const list = Array.isArray(value) ? value : [value].filter(Boolean);
  return {
    find: jest.fn().mockResolvedValue(list),
    findOne: jest.fn().mockResolvedValue(Array.isArray(value) ? (value[0] ?? null) : value),
    save: jest.fn(async (entity: any) => entity),
  };
}

describe("GenerateColdOpenHookUseCase perf", () => {
  it("keeps p95 under 80ms with eight archetypes and no LLM calls", async () => {
    const sceneRepo = repo(null);
    const useCase = new GenerateColdOpenHookUseCase(
      sceneRepo as any,
      repo(OPENING_ARCHETYPES) as any,
      repo({
        id: "session-1",
        campaignId: "campaign-1",
        characterIds: ["pc-1"],
      }) as any,
      repo({
        id: "campaign-1",
        tonalAnchor: { narratorVoice: "heroic-high-fantasy" },
        generationSeed: { storySeed: { protagonistHook: "Uma dívida antiga." } },
      }) as any,
      repo({ id: "loc-1", name: "Estrada Norte", type: "road" }) as any,
      repo([]) as any,
      repo({ id: "quest-1", isMainQuest: true, status: "active", objectives: [] }) as any,
      {
        assemblePersona: jest.fn().mockResolvedValue({
          characterId: "pc-1",
          name: "Goma",
          race: "Human",
          subrace: null,
          class: "Fighter",
          subclass: null,
          level: 1,
          background: "Soldier",
          alignment: "true-neutral",
          personality: {},
          currentHpPercent: 100,
          conditionsActive: [],
          keyEquipmentSummary: [],
        }),
      } as any,
      { publish: jest.fn().mockResolvedValue({}) } as any,
      { build: jest.fn((input: any) => ({ ...input, source: { traceId: "0123456789abcdef0123456789abcdef" } })) } as any,
      { warn: jest.fn(), error: jest.fn(), info: jest.fn(), setContext: jest.fn() } as any,
    );

    const samples: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const started = performance.now();
      await useCase.execute({
        id: `scene-${i}`,
        sessionId: "session-1",
        sceneNumber: 1,
        locationId: "loc-1",
      } as any);
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];

    expect(p95).toBeLessThanOrEqual(80);
  });
});
