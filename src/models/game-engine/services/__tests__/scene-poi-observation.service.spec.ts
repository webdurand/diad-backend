import { DomainException } from "src/common/observability/errors/diad-exception";
import { ScenePoiObservationService } from "../scene-poi-observation.service";

function makeService(overrides: Record<string, any> = {}) {
  const observationRepo = overrides.observationRepo ?? {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: value.id ?? "observation-1", ...value })),
  };
  const sessionRepo = overrides.sessionRepo ?? {
    findOne: jest.fn().mockResolvedValue({
      id: "session-1",
      campaignId: "campaign-1",
      config: {},
    }),
  };
  const poiRepo = overrides.poiRepo ?? {
    findOne: jest.fn().mockResolvedValue({
      id: "poi-1",
      campaignId: "campaign-1",
      name: "Taverna",
      type: "social",
      atmosphere: "vozes baixas",
      description: "Mesas marcadas por velas.",
    }),
  };
  const sceneRepo = overrides.sceneRepo ?? {
    findOne: jest.fn().mockResolvedValue({
      id: "scene-1",
      sceneNumber: 3,
      sessionId: "session-1",
      poiId: "poi-1",
    }),
  };

  return {
    service: new ScenePoiObservationService(
      observationRepo as any,
      sessionRepo as any,
      poiRepo as any,
      sceneRepo as any,
    ),
    observationRepo,
    sessionRepo,
    poiRepo,
    sceneRepo,
  };
}

describe("ScenePoiObservationService", () => {
  it("reusa cache cross-scene enquanto a observacao nao expirou", async () => {
    const existing = {
      id: "observation-1",
      sessionId: "session-1",
      poiId: "poi-1",
      lastSceneId: "scene-old",
      observationText: "Um rumor antigo ainda paira no balcao.",
      generatedAtTurn: 1,
      expiresAtTurn: 6,
      freshness: "fresh",
    };
    const { service, observationRepo } = makeService({
      observationRepo: {
        findOne: jest.fn().mockResolvedValue(existing),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => value),
      },
      sceneRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: "scene-new",
          sceneNumber: 4,
          sessionId: "session-1",
          poiId: "poi-1",
        }),
      },
    });

    const result = await service.findOrGenerate({
      sessionId: "session-1",
      poiId: "poi-1",
    });

    expect(result.observationText).toBe(existing.observationText);
    expect(result.lastSceneId).toBe("scene-old");
    expect(result.freshness).toBe("fresh");
    expect(observationRepo.save).not.toHaveBeenCalled();
  });

  it("gera nova observacao deterministica quando o cache expirou", async () => {
    const { service, observationRepo } = makeService({
      observationRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: "observation-1",
          sessionId: "session-1",
          poiId: "poi-1",
          lastSceneId: "scene-old",
          observationText: "Texto vencido.",
          generatedAtTurn: 1,
          expiresAtTurn: 4,
          freshness: "expired",
        }),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => value),
      },
      sceneRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: "scene-9",
          sceneNumber: 9,
          sessionId: "session-1",
          poiId: "poi-1",
        }),
      },
    });

    const result = await service.findOrGenerate({
      sessionId: "session-1",
      poiId: "poi-1",
    });

    expect(result.observationText).not.toBe("Texto vencido.");
    expect(result.generatedAtTurn).toBe(9);
    expect(result.expiresAtTurn).toBe(14);
    expect(result.lastSceneId).toBe("scene-9");
    expect(observationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "observation-1",
        freshness: "fresh",
      }),
    );
  });

  it("rejeita POI que nao pertence a campanha da sessao", async () => {
    const { service } = makeService({
      poiRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: "poi-1",
          campaignId: "campaign-other",
          name: "Outro lugar",
        }),
      },
    });

    await expect(
      service.findOrGenerate({ sessionId: "session-1", poiId: "poi-1" }),
    ).rejects.toBeInstanceOf(DomainException);
  });
});
