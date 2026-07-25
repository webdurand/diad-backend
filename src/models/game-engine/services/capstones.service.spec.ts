import { CapstonesService } from "./capstones.service";

describe("CapstonesService", () => {
  it("recupera um uso gasto de Forma Selvagem ao rolar iniciativa com Archdruid", async () => {
    const state = {
      character_id: "character-1",
      feature_uses_used: { "wild-shape": 4, "other-feature": 1 },
    };
    const participant = {
      id: "participant-1",
      type: "pc",
      characterId: "character-1",
      effectInstances: [],
    };
    const participants = {
      save: jest.fn(async (value) => value),
    };
    const stateRepo = {
      findOne: jest.fn().mockResolvedValue(state),
      save: jest.fn(async (value) => value),
    };
    const service = new CapstonesService(
      participants as any,
      stateRepo as any,
      {
        computeSheet: jest.fn().mockResolvedValue({
          hasArchdruid: true,
        }),
      } as any,
      {} as any,
    );

    const result = await service.runStartOfCombat(
      participant as any,
      "user-1",
    );

    expect(state.feature_uses_used).toEqual({
      "wild-shape": 3,
      "other-feature": 1,
    });
    expect(stateRepo.save).toHaveBeenCalledWith(state);
    expect(result.events).toEqual([
      expect.objectContaining({
        event_type: "capstone_archdruid_evergreen_triggered",
        data: expect.objectContaining({
          usesRegained: 1,
          usedBefore: 4,
          usedAfter: 3,
        }),
      }),
    ]);
    expect(participants.save).toHaveBeenCalledWith(participant);
  });

  it("não cria uso extra de Forma Selvagem quando Archdruid já está no máximo", async () => {
    const state = {
      character_id: "character-1",
      feature_uses_used: { "wild-shape": 0 },
    };
    const stateRepo = {
      findOne: jest.fn().mockResolvedValue(state),
      save: jest.fn(async (value) => value),
    };
    const service = new CapstonesService(
      { save: jest.fn(async (value) => value) } as any,
      stateRepo as any,
      {
        computeSheet: jest.fn().mockResolvedValue({
          hasArchdruid: true,
        }),
      } as any,
      {} as any,
    );

    const result = await service.runStartOfCombat(
      {
        id: "participant-1",
        type: "pc",
        characterId: "character-1",
        effectInstances: [],
      } as any,
      "user-1",
    );

    expect(state.feature_uses_used["wild-shape"]).toBe(0);
    expect(stateRepo.save).not.toHaveBeenCalled();
    expect(result.events).toEqual([]);
  });

  it("recupera os espaços de Pacto registrados no estado do personagem", async () => {
    const state = {
      character_id: "character-1",
      spell_slots_used: { pact: 2, "1": 1 },
    };
    const stateRepo = {
      findOne: jest.fn().mockResolvedValue(state),
      save: jest.fn(async (value) => value),
    };
    const service = new CapstonesService(
      { save: jest.fn() } as any,
      stateRepo as any,
      {
        computeSheet: jest.fn().mockResolvedValue({
          hasEldritchMaster: true,
        }),
      } as any,
      {} as any,
    );

    const result = await service.eldritchMaster(
      {
        id: "participant-1",
        type: "pc",
        characterId: "character-1",
        effectInstances: [],
      } as any,
      "user-1",
    );

    expect(result.ok).toBe(true);
    expect(result.regained).toBe(2);
    expect(state.spell_slots_used).toEqual({ pact: 0, "1": 1 });
    expect(stateRepo.save).toHaveBeenCalledWith(state);
  });
});
