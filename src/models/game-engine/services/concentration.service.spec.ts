import { ConcentrationService } from "./concentration.service";

describe("ConcentrationService summon lifecycle", () => {
  function setup(effectMetadata: Record<string, unknown>) {
    const caster: any = {
      id: "caster-1",
      encounterId: "enc-1",
      faction: "ally",
      isConcentrating: true,
      concentratingOn: "summon-beast",
      appliedEffects: [
        {
          kind: "summon",
          refId: "summon-1",
          targetParticipantId: "summon-1",
          description: "Summoned Wolf",
          metadata: effectMetadata,
        },
      ],
      effectInstances: [],
    };
    const summon: any = {
      id: "summon-1",
      encounterId: "enc-1",
      displayName: "Summoned Wolf",
      linkedCasterParticipantId: "caster-1",
      faction: "ally",
      controlledBy: "pc",
      effectInstances: [],
    };
    const participantsById = new Map<string, any>([
      [caster.id, caster],
      [summon.id, summon],
    ]);
    const participants: any = {
      findByIds: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation(async ({ where }) =>
        participantsById.get(where.id) ?? null,
      ),
      find: jest.fn().mockResolvedValue([caster, summon]),
      save: jest.fn().mockImplementation(async (entity) => entity),
      remove: jest.fn().mockImplementation(async (entity) => {
        participantsById.delete(entity.id);
      }),
    };
    const areas: any = {
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
    };
    const encounter = {
      id: "enc-1",
      turnOrder: ["caster-1", "summon-1", "enemy-1"],
      currentTurnIndex: 2,
    };
    const encounters: any = {
      findOne: jest.fn().mockResolvedValue(encounter),
      save: jest.fn().mockImplementation(async (entity) => entity),
    };
    return {
      caster,
      summon,
      encounter,
      participants,
      encounters,
      service: new ConcentrationService(participants, areas, encounters),
    };
  }

  it("remove summon concentrado quando o efeito manda dispensar", async () => {
    const { service, caster, participants, encounter } = setup({
      concentrationBreakBehavior: "dismiss",
    });

    const result = await service.break(caster, "damage");

    expect(participants.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "summon-1" }),
    );
    expect(encounter.turnOrder).toEqual(["caster-1", "enemy-1"]);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "summon_dismissed",
        target_participant_id: "summon-1",
      }),
    );
  });

  it("transforma summon em hostil quando o efeito manda perder controle", async () => {
    const { service, caster, summon, participants } = setup({
      concentrationBreakBehavior: "turn-hostile",
    });

    const result = await service.break(caster, "damage");

    expect(participants.remove).not.toHaveBeenCalled();
    expect(summon.controlledBy).toBe("ai");
    expect(summon.faction).toBe("enemy");
    expect(summon.linkedCasterParticipantId).toBeNull();
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "summon_control_lost",
        target_participant_id: "summon-1",
      }),
    );
  });

  it("inicia uma nova concentração e expõe o evento correspondente", async () => {
    const { service, caster, participants } = setup({});
    caster.isConcentrating = false;
    caster.concentratingOn = null;
    caster.appliedEffects = [];

    const result = await service.startNew(caster, "fog-cloud", 100, 15);

    expect(caster.isConcentrating).toBe(true);
    expect(caster.concentratingOn).toBe("fog-cloud");
    expect(participants.save).toHaveBeenCalledWith(caster);
    expect(result.events).toContainEqual({
      event_type: "concentration_started",
      actor_participant_id: "caster-1",
      data: {
        spellName: "fog-cloud",
        durationRounds: 100,
        saveDc: 15,
      },
    });
  });

  it("aplica letargia quando Haste termina", async () => {
    const { service, caster, participants } = setup({});
    caster.concentratingOn = "haste";
    caster.effectInstances = [
      {
        id: "haste-extra",
        kind: "extra_action",
        sourceSpellSlug: "haste",
        sourceCasterParticipantId: caster.id,
        payload: { amount: 1 },
        expiresAt: { kind: "concentration" },
        requiresConcentration: true,
        appliedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    participants.find.mockResolvedValue([
      {
        ...caster,
        effectInstances: caster.effectInstances.map((effect: any) => ({
          ...effect,
          payload: { ...effect.payload },
        })),
        conditions: [],
        conditionInstances: [],
      },
    ]);

    const result = await service.break(caster, "manual");

    expect(caster.conditions).toContain("haste_lethargy");
    expect(caster.conditionInstances).toContainEqual(
      expect.objectContaining({
        slug: "haste_lethargy",
        sourceSpell: "haste",
        durationRoundsRemaining: 1,
      }),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "condition_applied",
        data: expect.objectContaining({ slug: "haste_lethargy" }),
      }),
    );
  });

  it("preserva o motivo real ao remover uma área por concentração", async () => {
    const { caster, participants, encounters } = setup({});
    caster.appliedEffects = [
      {
        kind: "persistent-area",
        refId: "area-1",
        description: "Fog Cloud",
      },
    ];
    const area = {
      id: "area-1",
      effectKind: "fog",
      sourceSpell: "fog-cloud",
      casterParticipantId: caster.id,
      sourceConcentration: true,
    };
    const areas: any = {
      findOne: jest.fn().mockResolvedValue(area),
      delete: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
    };
    const service = new ConcentrationService(participants, areas, encounters);

    const result = await service.break(caster, "replaced");

    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "tile_effect_concentration_broken",
        data: expect.objectContaining({
          sourceSpell: "fog-cloud",
          reason: "replaced",
        }),
      }),
    );
  });

  it("remove do próprio conjurador uma condição incapacitante concentrada", async () => {
    const { caster, participants, encounters } = setup({});
    const instance = {
      id: "self-hold",
      slug: "paralyzed",
      source: "spell:hold-person",
      sourceSpell: "hold-person",
      sourceConcentration: true,
    };
    caster.concentratingOn = "hold-person";
    caster.conditions = ["paralyzed"];
    caster.conditionInstances = [instance];
    caster.appliedEffects = [
      {
        kind: "condition",
        refId: instance.id,
        targetParticipantId: caster.id,
        description: "hold-person: paralyzed",
      },
    ];
    participants.findByIds.mockResolvedValue([{ ...caster }]);
    participants.find.mockResolvedValue([caster]);
    const areas: any = {
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
    };
    const service = new ConcentrationService(participants, areas, encounters);

    const result = await service.break(caster, "incapacitated");

    expect(caster.conditions).toEqual([]);
    expect(caster.conditionInstances).toEqual([]);
    expect(caster.isConcentrating).toBe(false);
    expect(caster.concentratingOn).toBeNull();
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "condition_removed",
        target_participant_id: caster.id,
      }),
    );
  });
});
