import type { Repository } from "typeorm";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { BardFeaturesService } from "./bard-features.service";
import { InspirationService } from "./inspiration.service";
import type { EffectInstanceService } from "./effect-instance.service";
import type { CharacterStateService } from "src/models/characters/services/character-state.service";

/**
 * Contrato do parametro `preloaded`: quando o caller ja detem a entidade, ele e
 * o dono do flush. Reler e gravar aqui uma segunda copia fazia o save posterior
 * do CombatService ressuscitar o recurso ja gasto (dado de Inspiracao Bardica /
 * flag de Inspiracao).
 */
function makeBardicInspirationParticipant(): EncounterParticipantEntity {
  return {
    id: "bard-1",
    type: "pc",
    characterId: "char-bard-1",
    effectInstances: [
      {
        id: "effect-bi-1",
        kind: "bardic_inspiration",
        sourceFeatureSlug: "bardic-inspiration",
        payload: { dieSize: 8 },
      },
    ],
  } as unknown as EncounterParticipantEntity;
}

describe("BardFeaturesService.consumeBardicInspirationIfPresent", () => {
  function createService() {
    const participantRepo = {
      findOne: jest.fn(),
      save: jest.fn((p: unknown) => Promise.resolve(p)),
    };
    const service = new BardFeaturesService(
      participantRepo as unknown as Repository<EncounterParticipantEntity>,
      {} as CharacterSheetService,
      {} as EffectInstanceService,
    );
    return { service, participantRepo };
  }

  it("com `preloaded`, remove o efeito no objeto do caller sem reler nem gravar", async () => {
    const { service, participantRepo } = createService();
    const attacker = makeBardicInspirationParticipant();

    const result = await service.consumeBardicInspirationIfPresent(
      attacker.id,
      "attack_roll",
      () => 5,
      attacker,
    );

    expect(result).toMatchObject({ consumed: true, bonus: 5, dieSize: 8 });
    expect(attacker.effectInstances).toEqual([]);
    expect(participantRepo.findOne).not.toHaveBeenCalled();
    expect(participantRepo.save).not.toHaveBeenCalled();
  });

  it("sem `preloaded`, mantem o comportamento antigo de reler e gravar", async () => {
    const { service, participantRepo } = createService();
    const stored = makeBardicInspirationParticipant();
    participantRepo.findOne.mockResolvedValue(stored);

    const result = await service.consumeBardicInspirationIfPresent(
      stored.id,
      "saving_throw",
      () => 3,
    );

    expect(result.consumed).toBe(true);
    expect(participantRepo.findOne).toHaveBeenCalledTimes(1);
    expect(participantRepo.save).toHaveBeenCalledTimes(1);
  });

  it("sem efeito de Inspiracao Bardica, nao consome nada", async () => {
    const { service, participantRepo } = createService();
    const attacker = {
      id: "bard-2",
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.consumeBardicInspirationIfPresent(
      attacker.id,
      "ability_check",
      () => 7,
      attacker,
    );

    expect(result).toEqual({ consumed: false, bonus: 0, events: [] });
    expect(participantRepo.save).not.toHaveBeenCalled();
  });
});

describe("InspirationService.consumeIfArmed", () => {
  function createService() {
    const participantRepo = {
      findOne: jest.fn(),
      save: jest.fn((p: unknown) => Promise.resolve(p)),
    };
    const stateService = {
      setInspiration: jest.fn(() => Promise.resolve(undefined)),
    };
    const service = new InspirationService(
      participantRepo as unknown as Repository<EncounterParticipantEntity>,
      stateService as unknown as CharacterStateService,
    );
    return { service, participantRepo, stateService };
  }

  it("com `preloaded`, desarma o objeto do caller sem reler nem gravar", async () => {
    const { service, participantRepo, stateService } = createService();
    const attacker = {
      id: "pc-1",
      type: "pc",
      characterId: "char-pc-1",
      inspirationArmed: true,
    } as unknown as EncounterParticipantEntity;

    const result = await service.consumeIfArmed(
      attacker.id,
      "attack_roll",
      attacker,
    );

    expect(result.consumed).toBe(true);
    expect(attacker.inspirationArmed).toBe(false);
    expect(participantRepo.findOne).not.toHaveBeenCalled();
    expect(participantRepo.save).not.toHaveBeenCalled();
    // A ficha vive em outra tabela, entao continua sendo zerada aqui.
    expect(stateService.setInspiration).toHaveBeenCalledWith(
      "char-pc-1",
      false,
    );
  });

  it("sem `preloaded`, mantem o comportamento antigo de reler e gravar", async () => {
    const { service, participantRepo } = createService();
    participantRepo.findOne.mockResolvedValue({
      id: "pc-2",
      type: "monster",
      inspirationArmed: true,
    });

    const result = await service.consumeIfArmed("pc-2", "ability_check");

    expect(result.consumed).toBe(true);
    expect(participantRepo.findOne).toHaveBeenCalledTimes(1);
    expect(participantRepo.save).toHaveBeenCalledTimes(1);
  });

  it("com `preloaded` desarmado, nao consome nem grava", async () => {
    const { service, participantRepo } = createService();
    const attacker = {
      id: "pc-3",
      type: "pc",
      characterId: "char-pc-3",
      inspirationArmed: false,
    } as unknown as EncounterParticipantEntity;

    const result = await service.consumeIfArmed(
      attacker.id,
      "attack_roll",
      attacker,
    );

    expect(result).toEqual({ consumed: false });
    expect(participantRepo.findOne).not.toHaveBeenCalled();
    expect(participantRepo.save).not.toHaveBeenCalled();
  });
});
