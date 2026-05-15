import { QuestService } from "../quest.service";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";

describe("QuestService story-first events", () => {
  it("emite mission_progress_advanced com progresso velho e novo", async () => {
    const objective = {
      id: "obj-1",
      questId: "quest-1",
      sortOrder: 0,
      status: "active",
      progressCount: 0,
      description: "Encontrar a testemunha",
      isOptional: false,
    };
    const quest = {
      id: "quest-1",
      slug: "main",
      name: "A pista do porto",
      status: "active",
      isMainQuest: true,
      objectives: [objective],
    };
    const questRepo = {
      findOne: jest.fn().mockResolvedValue(quest),
      save: jest.fn(async (value) => value),
    };
    const objectiveRepo = {
      save: jest.fn(async (value) => value),
      find: jest.fn().mockResolvedValue([{ ...objective, status: "completed", progressCount: 1 }]),
    };
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue({ id: SESSION_ID, campaignId: CAMPAIGN_ID }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    const envelopeFactory = { build: jest.fn((input) => input) };
    const prereqRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const service = new QuestService(
      questRepo as any,
      objectiveRepo as any,
      prereqRepo as any,
      sessionRepo as any,
      eventBus as any,
      envelopeFactory as any,
    );

    await service.advanceObjective(
      SESSION_ID,
      "main",
      0,
      "completed",
      "A testemunha confirmou a pista.",
    );

    expect(envelopeFactory.build).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: "NarrativeEvent",
        eventType: "mission_progress_advanced",
        payload: expect.objectContaining({
          sessionId: SESSION_ID,
          objectiveId: "obj-1",
          oldProgress: 0,
          newProgress: 1,
        }),
      }),
    );
    expect(sessionRepo.update).toHaveBeenCalledWith(SESSION_ID, {
      turnsSinceMissionProgress: 0,
    });
  });
});
