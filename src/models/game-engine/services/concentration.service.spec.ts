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
});
