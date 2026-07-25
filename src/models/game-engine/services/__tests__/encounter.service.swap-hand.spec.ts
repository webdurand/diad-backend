import { EncounterService } from "../encounter.service";

describe("EncounterService.swapHand", () => {
  function setup(conditions: string[] = []) {
    const encounterRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "encounter-1",
        turnOrder: ["participant-1"],
        currentTurnIndex: 0,
      }),
    };
    const participant = {
      id: "participant-1",
      type: "pc",
      characterId: "character-1",
      conditions,
      freeObjectInteractionsUsed: 0,
    };
    const participantRepo = {
      findOne: jest.fn().mockResolvedValue(participant),
      save: jest.fn(async (value) => value),
    };
    const inventoryService = {
      setHand: jest.fn().mockResolvedValue(undefined),
    };

    const service = new EncounterService(
      encounterRepo as any,
      participantRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      inventoryService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, inventoryService, participantRepo };
  }

  it("blocks a free object interaction during Haste lethargy", async () => {
    const { service, inventoryService, participantRepo } = setup([
      "haste_lethargy",
    ]);

    const result = await service.swapHand(
      "user-1",
      "encounter-1",
      "participant-1",
      "equipment-1",
      "main",
    );

    expect(result).toEqual({
      ok: false,
      error: "Você não pode interagir com objetos nesta condição.",
      code: "ACTION_BLOCKED",
    });
    expect(inventoryService.setHand).not.toHaveBeenCalled();
    expect(participantRepo.save).not.toHaveBeenCalled();
  });

  it("keeps the normal free object interaction available", async () => {
    const { service, inventoryService, participantRepo } = setup();

    const result = await service.swapHand(
      "user-1",
      "encounter-1",
      "participant-1",
      "equipment-1",
      "main",
    );

    expect(result).toEqual({ ok: true, freeObjectInteractionsUsed: 1 });
    expect(inventoryService.setHand).toHaveBeenCalledWith(
      "user-1",
      "character-1",
      "equipment-1",
      { hand: "main" },
    );
    expect(participantRepo.save).toHaveBeenCalled();
  });
});
