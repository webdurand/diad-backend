import { SpellCastingService } from "./spell-casting.service";

describe("SpellCastingService · Dispel Magic integration", () => {
  it("consome Ação e slot antes de devolver o contrato explícito", async () => {
    const caster = {
      id: "caster",
      encounterId: "encounter",
      type: "pc",
      characterId: "character",
      displayName: "Paladino",
      positionX: 0,
      positionY: 0,
      faction: "ally",
      actionUsed: false,
      bonusActionUsed: false,
      reactionsUsed: 0,
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
      appliedEffects: [],
      isConcentrating: false,
      concentratingOn: null,
      sorceryPointsUsed: 0,
    };
    const target = {
      id: "target",
      encounterId: "encounter",
      type: "monster",
      displayName: "Ogre",
      positionX: 5,
      positionY: 0,
      faction: "enemy",
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
      appliedEffects: [],
      isConcentrating: false,
      isDefeated: false,
    };
    const spell = {
      slug: "dispel-magic",
      name: "Dispel Magic",
      level: 3,
      concentration: false,
      casting_time: "1 action",
      range: "120 feet",
      components: ["V", "S"],
      damage: null,
      heal_at_slot_level: null,
      dc: null,
    };
    const sheet = {
      totalLevel: 15,
      spells: [{ slug: "dispel-magic", name: "Dispel Magic" }],
      spellSlots: [{ level: 3, used: 0, total: 2, kind: "standard" }],
      classes: [
        {
          slug: "paladin",
          spellSaveDc: 16,
          spellAttackBonus: 8,
          spellcastingModifier: 4,
        },
      ],
      abilityScores: [],
      equipment: [],
    };
    const updateSpellSlots = jest.fn(async () => undefined);
    const saveParticipant = jest.fn(async (value) => value);
    const resolution = {
      target: {
        kind: "participant" as const,
        participantId: target.id,
        label: target.displayName,
      },
      castAtSlotLevel: 3,
      spellcastingModifier: 4,
      noEffect: true,
      effects: [],
    };
    const service = Object.create(SpellCastingService.prototype) as any;
    Object.assign(service, {
      encounterRepo: {
        findOne: jest.fn(async () => ({
          id: "encounter",
          status: "active",
          turnOrder: [caster.id],
          currentTurnIndex: 0,
          currentRound: 1,
          mapData: {},
        })),
      },
      participantRepo: {
        save: saveParticipant,
      },
      spellRepo: {
        findOne: jest.fn(async () => spell),
      },
      sheetService: {
        computeSheet: jest.fn(async () => sheet),
      },
      spellService: {
        updateSpellSlots,
      },
      diceService: {
        rollExpression: jest.fn(),
      },
      encounterService: {
        getParticipant: jest.fn(async (id: string) =>
          id === caster.id ? caster : target,
        ),
      },
      summoning: {
        getFindFamiliarOf: jest.fn(),
      },
      dispelMagic: {
        prepareTarget: jest.fn(async () => ({
          ok: true,
          value: {
            target: {
              kind: "participant",
              participantId: target.id,
            },
            label: target.displayName,
          },
          events: [],
        })),
        resolve: jest.fn(async () => ({
          resolution,
          events: [
            {
              event_type: "dispel_magic_no_effect",
              actor_participant_id: caster.id,
              target_participant_id: target.id,
              data: {},
            },
          ],
        })),
      },
    });

    const result = await service.castSpellInCombat({
      encounterId: "encounter",
      participantId: caster.id,
      spellSlug: "dispel-magic",
      slotLevel: 3,
      targetParticipantIds: [target.id],
      dispelTarget: {
        kind: "participant",
        participantId: target.id,
      },
      ownerUserId: "owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(updateSpellSlots).toHaveBeenCalledWith("owner", "character", {
      level: 3,
      used: 1,
    });
    expect(caster.actionUsed).toBe(true);
    expect(saveParticipant).toHaveBeenCalledWith(caster);
    expect(result.value.resourceDelta?.spellSlots).toEqual([
      expect.objectContaining({ level: 3, used: 1, total: 2 }),
    ]);
    expect(result.value.dispelMagic).toEqual(resolution);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: "spell_cast" }),
        expect.objectContaining({ event_type: "dispel_magic_no_effect" }),
      ]),
    );
  });
});
