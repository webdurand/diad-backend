import { QuestDefeatListener } from "./quest-defeat.listener";
import type { EventEnvelope } from "../event-envelope.types";

function makeListener(overrides: Record<string, any> = {}) {
  const processedRepo = overrides.processedRepo ?? {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => value),
  };
  const eventBus = overrides.eventBus ?? {
    publish: jest.fn(async (value: any) => value),
  };
  const envelopeFactory = overrides.envelopeFactory ?? {
    build: jest.fn((value: any) => ({
      eventId: "party-evt-1",
      version: 1,
      aggregateId: value.scope.encounterId ?? value.scope.sessionId,
      timestamp: "2026-06-10T00:00:00.000Z",
      ...value,
    })),
  };
  const logger = overrides.logger ?? {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };

  const listener = new QuestDefeatListener(
    processedRepo as any,
    (overrides.partRepo ?? {}) as any,
    (overrides.encounterRepo ?? {}) as any,
    (overrides.questRepo ?? {}) as any,
    (overrides.objectiveRepo ?? {}) as any,
    (overrides.npcRepo ?? {}) as any,
    (overrides.questService ?? {}) as any,
    eventBus as any,
    envelopeFactory as any,
    logger as any,
  );

  return { listener, processedRepo, eventBus, envelopeFactory, logger };
}

function makeEncounterEndedEnvelope(
  payload: Record<string, unknown> = {},
): EventEnvelope {
  return {
    eventId: "enc-ended-1",
    version: 1,
    aggregateId: "enc-1",
    timestamp: "2026-06-10T00:00:00.000Z",
    eventCategory: "EncounterEvent",
    eventType: "encounter_ended",
    source: {
      service: "diad-backend",
      module: "EncounterService.publishEncounterEnded",
      traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    scope: {
      campaignId: "camp-1",
      sessionId: "sess-1",
      encounterId: "enc-1",
    },
    payload: {
      sessionId: "sess-1",
      encounterName: "Ultima defesa",
      outcome: "defeat",
      pcsDefeated: [
        {
          participantId: "pc-1",
          characterId: "char-1",
          displayName: "Aric",
          dyingState: "dead",
        },
      ],
      ...payload,
    },
    audiences: ["Narrator", "Director", "HUD"],
  };
}

describe("QuestDefeatListener", () => {
  it("publishes party_defeated when encounter_ended says every PC is down", async () => {
    const { listener, eventBus, envelopeFactory, processedRepo } =
      makeListener();

    await listener.handle(makeEncounterEndedEnvelope({ allPcsDown: true }));

    expect(envelopeFactory.build).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: "NarrativeEvent",
        eventType: "party_defeated",
        scope: {
          campaignId: "camp-1",
          sessionId: "sess-1",
          encounterId: "enc-1",
        },
        payload: expect.objectContaining({
          sessionId: "sess-1",
          encounterId: "enc-1",
          encounterName: "Ultima defesa",
          outcome: "defeat",
          pcsDefeated: expect.arrayContaining([
            expect.objectContaining({ characterId: "char-1" }),
          ]),
        }),
        audiences: ["Narrator", "Director", "HUD"],
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(processedRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        listenerName: "QuestDefeatListener",
        eventId: "enc-ended-1",
      }),
    );
  });

  it("does not publish party_defeated for a partial party defeat", async () => {
    const { listener, eventBus, processedRepo } = makeListener();

    await listener.handle(makeEncounterEndedEnvelope({ allPcsDown: false }));

    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(processedRepo.save).not.toHaveBeenCalled();
  });
});
