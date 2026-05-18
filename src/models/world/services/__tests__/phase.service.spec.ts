import { PhaseService } from "../phase.service";
import { SceneEntity } from "src/entities/scene.entity";
import { SessionMessageEntity } from "src/entities/session-message.entity";
import { QuestObjectiveEntity } from "src/entities/quest-objective.entity";

function makeService(
  overrides: {
    dataSource?: any;
    eventBus?: any;
    envelopeFactory?: any;
    bookendArtifactRepo?: any;
  } = {},
): PhaseService {
  return new PhaseService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    overrides.dataSource ?? ({} as any),
    {} as any,
    overrides.eventBus ?? ({} as any),
    overrides.envelopeFactory ?? ({} as any),
    overrides.bookendArtifactRepo ?? ({} as any),
  );
}

describe("PhaseService", () => {
  it("returns pending when at least one OR unlock condition is met", () => {
    const service = makeService();

    const result = service.evaluateGate(
      {
        any: [
          { objective_completed: "objective-a" },
          { clock_filled: "clock-a" },
        ],
      },
      {
        objectiveStatuses: new Map([["objective-a", "completed"]]),
        clockFilledIds: new Set(),
      },
    );

    expect(result).toEqual({
      status: "pending",
      satisfiedCount: 1,
      totalConditions: 2,
      satisfiedKinds: ["objective_completed"],
    });
  });

  it("selects active objective by max priority with sortOrder as tie breaker", () => {
    const service = makeService();
    const low = {
      id: "low",
      status: "active",
      priority: 10,
      sortOrder: 0,
    } as QuestObjectiveEntity;
    const tieLater = {
      id: "later",
      status: "active",
      priority: 20,
      sortOrder: 2,
    } as QuestObjectiveEntity;
    const tieEarlier = {
      id: "earlier",
      status: "active",
      priority: 20,
      sortOrder: 1,
    } as QuestObjectiveEntity;

    expect(service.selectActiveObjective([low, tieLater, tieEarlier])?.id).toBe(
      "earlier",
    );
  });

  it("treats satisfied natural language triggers as gate progress", () => {
    const service = makeService();

    const result = service.evaluateGate(
      {
        any: [
          {
            conditionKey: "pc_reconheceu_traicao",
            naturalLanguage: "o PC reconheceu publicamente a traição",
          },
        ],
      },
      {
        nlTriggerSatisfiedKeys: new Set(["pc_reconheceu_traicao"]),
      },
    );

    expect(result).toEqual({
      status: "pending",
      satisfiedCount: 1,
      totalConditions: 1,
      satisfiedKinds: ["naturalLanguage"],
    });
  });

  it("publishes phase_changed with real bookend decision fields", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-17T12:00:00.000Z"));
    const sceneRepo = {
      findOne: jest.fn(async () => ({ sceneNumber: 5 })),
    };
    const messageRepo = {
      findOne: jest.fn(async () => ({
        createdAt: new Date("2026-05-17T11:20:00.000Z"),
      })),
    };
    const dataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === SceneEntity) return sceneRepo;
        if (entity === SessionMessageEntity) return messageRepo;
        throw new Error("unexpected repository");
      }),
    };
    const eventBus = { publish: jest.fn(async () => undefined) };
    const envelopeFactory = { build: jest.fn((input) => input) };
    const bookendArtifactRepo = { count: jest.fn(async () => 0) };
    const service = makeService({
      dataSource,
      eventBus,
      envelopeFactory,
      bookendArtifactRepo,
    });

    await (service as any).publishPhaseChanged(
      {
        id: "session-1",
        campaignId: "campaign-1",
        updatedAt: new Date("2026-05-17T11:10:00.000Z"),
      },
      phase(1, "Partida"),
      phase(2, "Retorno"),
      { id: "transition-1" },
      "0af7651916cd43dd8448eb211c80319c",
    );

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          phaseTransitionId: "transition-1",
          gapMinutes: 40,
          sceneNumber: 5,
          crossDay: false,
          phaseChangedSinceLastSession: true,
          previouslySeen: false,
        }),
      }),
    );
    jest.useRealTimers();
  });
});

function phase(index: number, name: string) {
  return {
    id: `phase-${index}`,
    storyArcId: "arc-1",
    index,
    name,
    description: null,
    emotionalArc: "rise",
    arcBeats: [],
    unlockConditions: {},
    completionConditions: {},
    transitionBeatNarrativeSeed: null,
    deprecatesOnAdvance: {},
    isReversible: false,
    createdAt: new Date("2026-05-17T10:00:00.000Z"),
    updatedAt: new Date("2026-05-17T10:00:00.000Z"),
  };
}
