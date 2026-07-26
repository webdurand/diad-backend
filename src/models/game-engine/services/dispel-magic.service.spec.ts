import { DispelMagicService } from "./dispel-magic.service";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type { PersistentAreaEffectEntity } from "src/entities/persistent-area-effect.entity";

function participant(
  overrides: Partial<EncounterParticipantEntity> = {},
): EncounterParticipantEntity {
  return {
    id: "target",
    encounterId: "encounter",
    displayName: "Alvo",
    type: "pc",
    positionX: 4,
    positionY: 4,
    isDefeated: false,
    isConcentrating: false,
    concentratingOn: null,
    conditions: [],
    conditionInstances: [],
    effectInstances: [],
    appliedEffects: [],
    ...overrides,
  } as EncounterParticipantEntity;
}

function area(
  overrides: Partial<PersistentAreaEffectEntity> = {},
): PersistentAreaEffectEntity {
  return {
    id: "area",
    encounterId: "encounter",
    casterParticipantId: "source-caster",
    sourceSpell: "wall-of-fire",
    effectKind: "wall-of-fire",
    originCell: { x: 5, y: 5 },
    slotLevel: 4,
    sourceConcentration: false,
    narrativeDescriptor: "Muralha de Fogo",
    ...overrides,
  } as PersistentAreaEffectEntity;
}

function setup(input?: {
  target?: EncounterParticipantEntity;
  areas?: PersistentAreaEffectEntity[];
  rolls?: number[];
}) {
  const caster = participant({
    id: "caster",
    displayName: "Conjurador",
    positionX: 0,
    positionY: 0,
  });
  const target = input?.target ?? participant();
  const participantRows = new Map(
    [caster, target].map((entry) => [entry.id, entry]),
  );
  const areaRows = new Map(
    (input?.areas ?? []).map((entry) => [entry.id, entry]),
  );
  const participants = {
    findOne: jest.fn(
      async ({ where }: { where: { id: string } }) =>
        participantRows.get(where.id) ?? null,
    ),
    find: jest.fn(async () => [...participantRows.values()]),
  };
  const areas = {
    findOne: jest.fn(
      async ({ where }: { where: { id: string } }) =>
        areaRows.get(where.id) ?? null,
    ),
    delete: jest.fn(async ({ id }: { id: string }) => {
      areaRows.delete(id);
      return { affected: 1 };
    }),
  };
  const spells = {
    findOne: jest.fn(async () => null),
  };
  const rolls = [...(input?.rolls ?? [])];
  const dice = {
    roll: jest.fn(() => rolls.shift() ?? 10),
  };
  const conditions = {
    removeConditionInstance: jest.fn(
      async (
        row: EncounterParticipantEntity,
        conditionId: string,
        reason: string,
      ) => {
        const before = row.conditionInstances.length;
        row.conditionInstances = row.conditionInstances.filter(
          (condition) => condition.id !== conditionId,
        );
        row.conditions = row.conditionInstances.map(
          (condition) => condition.slug,
        );
        return {
          removed: row.conditionInstances.length < before,
          events: [
            {
              event_type: "condition_removed",
              target_participant_id: row.id,
              data: { instanceId: conditionId, reason },
            },
          ],
        };
      },
    ),
  };
  const effects = {
    removeEffect: jest.fn(
      async (row: EncounterParticipantEntity, effectId: string) => {
        const before = row.effectInstances.length;
        row.effectInstances = row.effectInstances.filter(
          (effect) => effect.id !== effectId,
        );
        return {
          removed: row.effectInstances.length < before,
          events: [],
        };
      },
    ),
  };
  const concentration = {
    break: jest.fn(async () => ({ events: [] })),
  };
  const transformation = {
    revertForm: jest.fn(),
  };
  const service = new DispelMagicService(
    participants as never,
    areas as never,
    spells as never,
    dice as never,
    conditions as never,
    effects as never,
    concentration as never,
    transformation as never,
  );
  return {
    service,
    caster,
    target,
    participantRows,
    areaRows,
    participants,
    areas,
    spells,
    dice,
    conditions,
    effects,
    concentration,
  };
}

describe("DispelMagicService", () => {
  it("encerra automaticamente magia de nível 3 e a remoção persiste", async () => {
    const target = participant({
      conditionInstances: [
        {
          id: "blindness",
          slug: "blinded",
          appliedBy: "source-caster",
          sourceSpell: "blindness-deafness",
          sourceConcentration: false,
          source: "spell:blindness-deafness",
          saveAbility: "con",
          saveDc: 15,
          repeatSaveTiming: "end_of_turn",
          durationRoundsRemaining: 10,
          level: 3,
          appliedAt: new Date().toISOString(),
        },
      ],
      conditions: ["blinded"],
    });
    const { service, caster, dice, conditions } = setup({ target });
    const prepared = await service.prepareTarget({
      encounterId: "encounter",
      caster,
      target: { kind: "participant", participantId: target.id },
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const first = await service.resolve({
      encounterId: "encounter",
      prepared: prepared.value,
      castAtSlotLevel: 3,
      spellcastingModifier: 4,
      casterParticipantId: caster.id,
    });
    expect(first.resolution.effects).toEqual([
      expect.objectContaining({
        sourceSpellSlug: "blindness-deafness",
        spellLevel: 3,
        roll: null,
        dc: null,
        outcome: "dispelled_automatic",
        removed: true,
      }),
    ]);
    expect(dice.roll).not.toHaveBeenCalled();
    expect(conditions.removeConditionInstance).toHaveBeenCalledWith(
      target,
      "blindness",
      "dispel_magic",
    );

    const afterReload = await service.resolve({
      encounterId: "encounter",
      prepared: prepared.value,
      castAtSlotLevel: 3,
      spellcastingModifier: 4,
      casterParticipantId: caster.id,
    });
    expect(afterReload.resolution.noEffect).toBe(true);
  });

  it("mantém nível 4+ em falha e remove em sucesso do teste CD 10 + nível", async () => {
    const target = participant({
      effectInstances: [
        {
          id: "freedom",
          kind: "speed_bonus",
          sourceSpellSlug: "freedom-of-movement",
          sourceCasterParticipantId: "source-caster",
          payload: { slotLevel: 4 },
          expiresAt: { kind: "rounds", value: 600 },
          requiresConcentration: false,
          appliedAt: new Date().toISOString(),
        },
      ],
    });
    const { service, caster, effects, dice } = setup({
      target,
      rolls: [8, 10],
    });
    const prepared = await service.prepareTarget({
      encounterId: "encounter",
      caster,
      target: { kind: "participant", participantId: target.id },
    });
    if (!prepared.ok) throw new Error("target should be valid");

    const failed = await service.resolve({
      encounterId: "encounter",
      prepared: prepared.value,
      castAtSlotLevel: 3,
      spellcastingModifier: 3,
      casterParticipantId: caster.id,
    });
    expect(failed.resolution.effects[0]).toEqual(
      expect.objectContaining({
        spellLevel: 4,
        roll: 8,
        modifier: 3,
        dc: 14,
        total: 11,
        outcome: "check_failed",
        removed: false,
      }),
    );
    expect(effects.removeEffect).not.toHaveBeenCalled();

    const succeeded = await service.resolve({
      encounterId: "encounter",
      prepared: prepared.value,
      castAtSlotLevel: 3,
      spellcastingModifier: 4,
      casterParticipantId: caster.id,
    });
    expect(succeeded.resolution.effects[0]).toEqual(
      expect.objectContaining({
        roll: 10,
        modifier: 4,
        dc: 14,
        total: 14,
        outcome: "dispelled_check",
        removed: true,
      }),
    );
    expect(dice.roll).toHaveBeenCalledTimes(2);
  });

  it("upcast encerra automaticamente magia até o nível do slot", async () => {
    const target = participant({
      effectInstances: [
        {
          id: "fifth-level",
          kind: "ac_bonus",
          sourceSpellSlug: "greater-restoration",
          sourceCasterParticipantId: "source-caster",
          payload: { slotLevel: 5 },
          expiresAt: { kind: "rounds", value: 10 },
          requiresConcentration: false,
          appliedAt: new Date().toISOString(),
        },
      ],
    });
    const { service, caster, dice } = setup({ target });
    const prepared = await service.prepareTarget({
      encounterId: "encounter",
      caster,
      target: { kind: "participant", participantId: target.id },
    });
    if (!prepared.ok) throw new Error("target should be valid");
    const result = await service.resolve({
      encounterId: "encounter",
      prepared: prepared.value,
      castAtSlotLevel: 5,
      spellcastingModifier: 2,
      casterParticipantId: caster.id,
    });
    expect(result.resolution.effects[0].outcome).toBe("dispelled_automatic");
    expect(dice.roll).not.toHaveBeenCalled();
  });

  it("consigna alvo sem magia ongoing sem fabricar efeito", async () => {
    const { service, caster, target } = setup();
    const prepared = await service.prepareTarget({
      encounterId: "encounter",
      caster,
      target: { kind: "participant", participantId: target.id },
    });
    if (!prepared.ok) throw new Error("target should be valid");
    const result = await service.resolve({
      encounterId: "encounter",
      prepared: prepared.value,
      castAtSlotLevel: 3,
      spellcastingModifier: 4,
      casterParticipantId: caster.id,
    });
    expect(result.resolution).toEqual(
      expect.objectContaining({ noEffect: true, effects: [] }),
    );
    expect(result.events).toEqual([
      expect.objectContaining({ event_type: "dispel_magic_no_effect" }),
    ]);
  });

  it("rejeita criatura e efeito de mapa além de 120 pés", async () => {
    const target = participant({ positionX: 25, positionY: 0 });
    const farArea = area({ originCell: { x: 25, y: 0 } });
    const { service, caster } = setup({ target, areas: [farArea] });
    await expect(
      service.prepareTarget({
        encounterId: "encounter",
        caster,
        target: { kind: "participant", participantId: target.id },
      }),
    ).resolves.toEqual(
      expect.objectContaining({ ok: false, code: "SPELL_OUT_OF_RANGE" }),
    );
    await expect(
      service.prepareTarget({
        encounterId: "encounter",
        caster,
        target: { kind: "tile-effect", areaId: farArea.id },
      }),
    ).resolves.toEqual(
      expect.objectContaining({ ok: false, code: "SPELL_OUT_OF_RANGE" }),
    );
  });

  it("seleciona área por ID, resolve o nível e remove a linha persistida", async () => {
    const wall = area();
    const { service, caster, areas, areaRows, dice } = setup({
      areas: [wall],
      rolls: [12],
    });
    const prepared = await service.prepareTarget({
      encounterId: "encounter",
      caster,
      target: { kind: "tile-effect", areaId: wall.id },
    });
    if (!prepared.ok) throw new Error("target should be valid");
    const result = await service.resolve({
      encounterId: "encounter",
      prepared: prepared.value,
      castAtSlotLevel: 3,
      spellcastingModifier: 2,
      casterParticipantId: caster.id,
    });
    expect(result.resolution.effects[0]).toEqual(
      expect.objectContaining({
        effectId: wall.id,
        effectKind: "tile-effect",
        spellLevel: 4,
        roll: 12,
        dc: 14,
        total: 14,
        removed: true,
      }),
    );
    expect(areas.delete).toHaveBeenCalledWith({ id: wall.id });
    expect(areaRows.has(wall.id)).toBe(false);
    expect(dice.roll).toHaveBeenCalledTimes(1);
  });
});
