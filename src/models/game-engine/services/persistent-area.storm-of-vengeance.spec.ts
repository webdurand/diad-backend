import { PersistentAreaEffectEntity } from "src/entities/persistent-area-effect.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { PersistentAreaService } from "./persistent-area.service";

function stormArea(
  tacticalMetadata: Record<string, unknown> = { createdRound: 1 },
): PersistentAreaEffectEntity {
  return {
    id: "storm-area",
    encounterId: "encounter",
    casterParticipantId: "caster",
    sourceSpell: "storm-of-vengeance",
    effectKind: "storm-of-vengeance",
    shapeKind: "cylinder",
    originCell: { x: 10, y: 10 },
    radiusCells: 72,
    saveDc: 19,
    slotLevel: 9,
    tacticalMetadata: {
      tags: ["multi-round"],
      tacticalValue: 10,
      beneficiaryFaction: "caster",
      ...tacticalMetadata,
    },
  } as PersistentAreaEffectEntity;
}

function participant(
  id: string,
  faction: "ally" | "enemy",
): EncounterParticipantEntity {
  return {
    id,
    encounterId: "encounter",
    displayName: id,
    faction,
    positionX: 10,
    positionY: 10,
    isDefeated: false,
    conditionInstances: [],
  } as EncounterParticipantEntity;
}

describe("PersistentAreaService Storm of Vengeance", () => {
  it("reuses one damage roll for every target in round 2", async () => {
    const area = stormArea();
    const areas = {
      find: jest.fn().mockResolvedValue([area]),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const dice = {
      rollExpression: jest.fn().mockReturnValue({ total: 4 }),
      roll: jest.fn(),
    };
    const service = new PersistentAreaService(
      areas as never,
      dice as never,
      {} as never,
    );

    const result = await service.resolveStormOfVengeanceTurn(
      participant("caster", "ally"),
      2,
      [
        participant("caster", "ally"),
        participant("enemy-1", "enemy"),
        participant("enemy-2", "enemy"),
      ],
    );

    const damageEvents = result.events.filter(
      (event) => event.event_type === "tile_effect_damage_applied",
    );
    expect(dice.rollExpression).toHaveBeenCalledTimes(1);
    expect(damageEvents.map((event) => event.data?.amount)).toEqual([4, 4, 4]);
    expect(result.totalDamage).toBe(12);
  });

  it("shares the round 3 roll while resolving each Dexterity save separately", async () => {
    const area = stormArea();
    const areas = {
      find: jest.fn().mockResolvedValue([area]),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const dice = {
      rollExpression: jest.fn().mockReturnValue({ total: 40 }),
      roll: jest.fn().mockReturnValueOnce(20).mockReturnValueOnce(1),
    };
    const service = new PersistentAreaService(
      areas as never,
      dice as never,
      {} as never,
    );

    const result = await service.resolveStormOfVengeanceTurn(
      participant("caster", "ally"),
      3,
      [
        participant("caster", "ally"),
        participant("enemy-1", "enemy"),
        participant("enemy-2", "enemy"),
      ],
      async () => ({ modifier: 0 }),
    );

    const damageEvents = result.events.filter(
      (event) => event.event_type === "tile_effect_damage_applied",
    );
    const saveEvents = result.events.filter(
      (event) => event.event_type === "tile_effect_save_rolled",
    );
    expect(dice.rollExpression).toHaveBeenCalledTimes(1);
    expect(saveEvents).toHaveLength(2);
    expect(damageEvents.map((event) => event.data?.amount)).toEqual([20, 40]);
    expect(result.totalDamage).toBe(60);
  });
});
