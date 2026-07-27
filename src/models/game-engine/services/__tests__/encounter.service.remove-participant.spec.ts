import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterService } from "../encounter.service";

describe("EncounterService.removeParticipant", () => {
  function setup(options: {
    turnOrder: string[];
    currentTurnIndex: number;
    currentRound?: number;
    status?: EncounterEntity["status"];
    participants?: string[];
  }) {
    const encounter = {
      id: "encounter-1",
      status: options.status ?? "active",
      currentRound: options.currentRound ?? 1,
      currentTurnIndex: options.currentTurnIndex,
      turnOrder: [...options.turnOrder],
    } as EncounterEntity;
    const participantIds = options.participants ?? options.turnOrder;
    const participants = participantIds.map(
      (id) =>
        ({
          id,
          encounterId: encounter.id,
        }) as EncounterParticipantEntity,
    );
    const participantById = new Map(
      participants.map((participant) => [participant.id, participant]),
    );
    const transactionParticipantRepo = {
      findOne: jest.fn(async ({ where }: any) => {
        return participantById.get(where.id) ?? null;
      }),
      find: jest.fn().mockResolvedValue(participants),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const transactionEncounterRepo = {
      findOne: jest.fn().mockResolvedValue(encounter),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === EncounterEntity) {
          return transactionEncounterRepo;
        }
        if (entity === EncounterParticipantEntity) {
          return transactionParticipantRepo;
        }
        throw new Error("Unexpected repository");
      }),
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const encounterRepo = { manager };
    const service = new EncounterService(
      encounterRepo as any,
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
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return {
      service,
      encounter,
      transactionEncounterRepo,
      transactionParticipantRepo,
    };
  }

  it("advances to the next participant when the current participant is removed", async () => {
    const {
      service,
      encounter,
      transactionEncounterRepo,
      transactionParticipantRepo,
    } = setup({
      turnOrder: ["fighter", "zombie", "cleric"],
      currentTurnIndex: 1,
      currentRound: 3,
    });

    await service.removeParticipant("encounter-1", "zombie");

    expect(encounter.turnOrder).toEqual(["fighter", "cleric"]);
    expect(encounter.currentTurnIndex).toBe(1);
    expect(encounter.turnOrder[encounter.currentTurnIndex]).toBe("cleric");
    expect(encounter.currentRound).toBe(3);
    expect(transactionEncounterRepo.save).toHaveBeenCalledWith(encounter);
    expect(transactionParticipantRepo.delete).toHaveBeenCalledWith("zombie");
  });

  it("wraps to the first valid participant and advances the round", async () => {
    const { service, encounter } = setup({
      turnOrder: ["fighter", "cleric", "zombie"],
      currentTurnIndex: 2,
      currentRound: 4,
    });

    await service.removeParticipant("encounter-1", "zombie");

    expect(encounter.turnOrder).toEqual(["fighter", "cleric"]);
    expect(encounter.currentTurnIndex).toBe(0);
    expect(encounter.turnOrder[encounter.currentTurnIndex]).toBe("fighter");
    expect(encounter.currentRound).toBe(5);
  });

  it("preserves the active participant when an earlier participant is removed", async () => {
    const { service, encounter } = setup({
      turnOrder: ["fighter", "zombie", "cleric"],
      currentTurnIndex: 2,
      currentRound: 2,
    });

    await service.removeParticipant("encounter-1", "fighter");

    expect(encounter.turnOrder).toEqual(["zombie", "cleric"]);
    expect(encounter.currentTurnIndex).toBe(1);
    expect(encounter.turnOrder[encounter.currentTurnIndex]).toBe("cleric");
    expect(encounter.currentRound).toBe(2);
  });

  it("skips stale turn-order entries when selecting the successor", async () => {
    const { service, encounter } = setup({
      turnOrder: ["zombie", "missing-participant", "cleric"],
      currentTurnIndex: 0,
      currentRound: 2,
      participants: ["zombie", "cleric"],
    });

    await service.removeParticipant("encounter-1", "zombie");

    expect(encounter.turnOrder).toEqual(["cleric"]);
    expect(encounter.currentTurnIndex).toBe(0);
    expect(encounter.turnOrder[encounter.currentTurnIndex]).toBe("cleric");
    expect(encounter.currentRound).toBe(2);
  });

  it("clears the turn state without creating a new round when no participant remains", async () => {
    const { service, encounter } = setup({
      turnOrder: ["zombie"],
      currentTurnIndex: 0,
      currentRound: 6,
    });

    await service.removeParticipant("encounter-1", "zombie");

    expect(encounter.turnOrder).toEqual([]);
    expect(encounter.currentTurnIndex).toBe(0);
    expect(encounter.currentRound).toBe(6);
  });

  it("does not advance the round while initiative is still being rolled", async () => {
    const { service, encounter } = setup({
      turnOrder: ["fighter", "zombie"],
      currentTurnIndex: 1,
      currentRound: 1,
      status: "rolling_initiative",
    });

    await service.removeParticipant("encounter-1", "zombie");

    expect(encounter.turnOrder).toEqual(["fighter"]);
    expect(encounter.currentTurnIndex).toBe(0);
    expect(encounter.currentRound).toBe(1);
  });

  it("repairs a stale current-turn ID when the participant was already deleted", async () => {
    const { service, encounter, transactionParticipantRepo } = setup({
      turnOrder: ["zombie", "fighter"],
      currentTurnIndex: 0,
      currentRound: 3,
      participants: ["fighter"],
    });

    await service.removeParticipant("encounter-1", "zombie");

    expect(encounter.turnOrder).toEqual(["fighter"]);
    expect(encounter.currentTurnIndex).toBe(0);
    expect(encounter.turnOrder[encounter.currentTurnIndex]).toBe("fighter");
    expect(encounter.currentRound).toBe(3);
    expect(transactionParticipantRepo.delete).toHaveBeenCalledWith("zombie");
  });
});
