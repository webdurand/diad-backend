import type { Repository } from "typeorm";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type { PersistentAreaEffectEntity } from "src/entities/persistent-area-effect.entity";
import { SavingThrowService } from "./saving-throw.service";
import type { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import type { DiceService } from "./dice.service";
import type { ConditionEffectsService } from "./condition-effects.service";
import type { EventService } from "./event.service";
import type { InspirationService } from "./inspiration.service";
import type { ExhaustionService } from "./exhaustion.service";

describe("SavingThrowService — Conjure Animals", () => {
  it("rolls a Strength save with advantage for the caster within 5 feet of the pack", async () => {
    const sheetService = {
      computeSheet: jest.fn().mockResolvedValue({
        savingThrows: [{ slug: "str", name: "Strength", bonus: 3 }],
        conditions: [],
        classes: [],
        abilityScores: [],
        exhaustionLevel: 0,
      }),
    } as unknown as CharacterSheetService;
    const dice = {
      rollWithAdvantage: jest.fn().mockReturnValue({
        roll1: 4,
        roll2: 16,
        chosen: 16,
      }),
    } as unknown as DiceService;
    const conditions = {
      getSavingThrowModifiers: jest.fn().mockReturnValue({
        autoFail: false,
        hasAdvantage: false,
        hasDisadvantage: false,
      }),
    } as unknown as ConditionEffectsService;
    const inspiration = {
      consumeIfArmed: jest.fn().mockResolvedValue({ consumed: false }),
    } as unknown as InspirationService;
    const exhaustion = {
      getModifiers: jest.fn(),
    } as unknown as ExhaustionService;
    const subject = {
      id: "druid-1",
      encounterId: "enc-1",
      type: "pc",
      characterId: "char-1",
      positionX: 10,
      positionY: 8,
      isDefeated: false,
      isConcentrating: true,
      concentratingOn: "conjure-animals",
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;
    const participantRepo = {
      findOne: jest.fn().mockResolvedValue(subject),
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<EncounterParticipantEntity>;
    const areaRepo = {
      findOne: jest.fn().mockResolvedValue({
        originCell: { x: 11, y: 6 },
      }),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const service = new SavingThrowService(
      sheetService,
      dice,
      conditions,
      {} as EventService,
      inspiration,
      exhaustion,
      participantRepo,
      areaRepo,
    );

    const result = await service.rollSavingThrow({
      characterId: "char-1",
      userId: "user-1",
      participantId: "druid-1",
      encounterId: "enc-1",
      ability: "str",
      dc: 15,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.roll).toBe(16);
    expect(result.value.total).toBe(19);
    expect(result.value.advantage).toMatchObject({
      roll1: 4,
      roll2: 16,
      chosen: 16,
    });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "conjure_animals_strength_save_advantage",
        data: expect.objectContaining({
          roll1: 4,
          roll2: 16,
          chosen: 16,
          finalTotal: 19,
          success: true,
        }),
      }),
    );
  });
});
