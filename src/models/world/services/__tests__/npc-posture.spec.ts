import { SessionNpcStateService } from "../session-npc-state.service";
import { SessionNpcStateEntity } from "src/entities/session-npc-state.entity";

const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";
const NPC_ID = "44444444-4444-4444-8444-444444444444";
const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";

function makeState(
  posture: SessionNpcStateEntity["posture"] = "peaceful",
): SessionNpcStateEntity {
  return {
    id: "state-1",
    gameSessionId: SESSION_ID,
    npcId: NPC_ID,
    status: "alive",
    disposition: "neutral",
    posture,
  } as SessionNpcStateEntity;
}

describe("SessionNpcStateService.updatePosture", () => {
  it("muta posture e emite npc_posture_changed", async () => {
    const state = makeState("peaceful");
    const saved = makeState("drawing_weapon");
    const repo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(state)
        .mockResolvedValueOnce(saved),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      query: jest.fn().mockResolvedValue([{ id: "state-1" }]),
    };
    const envelope = { eventType: "npc_posture_changed" };
    const factory = { build: jest.fn(() => envelope) };
    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new (SessionNpcStateService as any)(
      repo,
      eventBus,
      factory,
    ) as SessionNpcStateService;

    const result = await service.updatePosture({
      gameSessionId: SESSION_ID,
      campaignId: CAMPAIGN_ID,
      npcId: NPC_ID,
      posture: "drawing_weapon",
      traceId: TRACE_ID,
    });

    expect(result.posture).toBe("drawing_weapon");
    expect(repo.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE "id" = $1 AND "posture" = $2'),
      ["state-1", "peaceful", "drawing_weapon"],
    );
    expect(repo.save).not.toHaveBeenCalled();
    expect(factory.build).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: "NarrativeEvent",
        eventType: "npc_posture_changed",
        source: expect.objectContaining({
          service: "diad-backend",
          module: "SessionNpcStateService.updatePosture",
          traceId: TRACE_ID,
        }),
        scope: { campaignId: CAMPAIGN_ID, sessionId: SESSION_ID },
        payload: expect.objectContaining({
          sessionId: SESSION_ID,
          npcId: NPC_ID,
          oldPosture: "peaceful",
          newPosture: "drawing_weapon",
          triggeredBy: "archivist_pre_commit",
        }),
        audiences: ["Narrator", "Director", "HUD"],
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(envelope);
  });

  it("recarrega e reemite com oldPosture atual quando CAS detecta concorrência", async () => {
    const firstRead = makeState("peaceful");
    const afterConcurrentUpdate = makeState("drawing_weapon");
    const saved = makeState("combat");
    const repo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(firstRead)
        .mockResolvedValueOnce(afterConcurrentUpdate)
        .mockResolvedValueOnce(saved),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "state-1" }]),
    };
    const envelope = { eventType: "npc_posture_changed" };
    const factory = { build: jest.fn(() => envelope) };
    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new (SessionNpcStateService as any)(
      repo,
      eventBus,
      factory,
    ) as SessionNpcStateService;

    const result = await service.updatePosture({
      gameSessionId: SESSION_ID,
      campaignId: CAMPAIGN_ID,
      npcId: NPC_ID,
      posture: "combat",
    });

    expect(result.posture).toBe("combat");
    expect(repo.query).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      ["state-1", "peaceful", "combat"],
    );
    expect(repo.query).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      ["state-1", "drawing_weapon", "combat"],
    );
    expect(factory.build).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          oldPosture: "drawing_weapon",
          newPosture: "combat",
        }),
      }),
    );
  });
});
