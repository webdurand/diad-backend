import {
  buildBestialSpiritStatBlock,
  buildElementalSpiritStatBlock,
  buildOtherworldlySteedStatBlock,
  getSummonMetadata,
  getSummonStatBlock,
  isFindFamiliarSummon,
  isFindSteedSummon,
} from "./summon-stat-block";

describe("Bestial Spirit stat block", () => {
  it.each([
    {
      form: "air" as const,
      slotLevel: 2,
      armorClass: 13,
      maxHp: 20,
      speed: 60,
      attacks: 1,
      flyby: true,
      packTactics: false,
    },
    {
      form: "land" as const,
      slotLevel: 4,
      armorClass: 15,
      maxHp: 40,
      speed: 30,
      attacks: 2,
      flyby: false,
      packTactics: true,
    },
    {
      form: "water" as const,
      slotLevel: 9,
      armorClass: 20,
      maxHp: 65,
      speed: 30,
      attacks: 4,
      flyby: false,
      packTactics: true,
    },
  ])(
    "calcula forma $form no slot $slotLevel",
    ({
      form,
      slotLevel,
      armorClass,
      maxHp,
      speed,
      attacks,
      flyby,
      packTactics,
    }) => {
      const block = buildBestialSpiritStatBlock({
        form,
        slotLevel,
        spellAttackBonus: 11,
      });

      expect(block).toEqual(
        expect.objectContaining({
          form,
          slotLevel,
          armorClass,
          maxHp,
          speed,
        }),
      );
      expect(block.attack).toEqual(
        expect.objectContaining({
          attackBonus: 11,
          damageDice: "1d8",
          damageBonus: 4 + slotLevel,
          attacksPerAction: attacks,
        }),
      );
      expect(block.traits.flyby).toBe(flyby);
      expect(block.traits.packTactics).toBe(packTactics);
      expect(block.traits.waterBreathing).toBe(form === "water");
    },
  );

  it("recupera a ficha persistida no efeito do summon", () => {
    const block = buildBestialSpiritStatBlock({
      form: "air",
      slotLevel: 2,
      spellAttackBonus: 7,
    });
    expect(
      getSummonStatBlock({
        appliedEffects: [
          {
            kind: "summon",
            refId: "summon-beast-spell",
            targetParticipantId: null,
            metadata: { statBlock: block },
          },
        ],
      } as any),
    ).toEqual(block);
  });
});

describe("Elemental Spirit stat block", () => {
  it.each([
    {
      form: "air" as const,
      slotLevel: 4,
      armorClass: 15,
      maxHp: 50,
      movementModes: { walk: 40, fly: 40 },
      damageType: "lightning",
      attacks: 2,
      amorphousForm: true,
      hover: true,
    },
    {
      form: "earth" as const,
      slotLevel: 5,
      armorClass: 16,
      maxHp: 60,
      movementModes: { walk: 40, burrow: 40 },
      damageType: "bludgeoning",
      attacks: 2,
      amorphousForm: false,
      hover: false,
    },
    {
      form: "fire" as const,
      slotLevel: 6,
      armorClass: 17,
      maxHp: 70,
      movementModes: { walk: 40 },
      damageType: "fire",
      attacks: 3,
      amorphousForm: true,
      hover: false,
    },
    {
      form: "water" as const,
      slotLevel: 9,
      armorClass: 20,
      maxHp: 100,
      movementModes: { walk: 40, swim: 40 },
      damageType: "cold",
      attacks: 4,
      amorphousForm: true,
      hover: false,
    },
  ])(
    "calcula forma $form no slot $slotLevel",
    ({
      form,
      slotLevel,
      armorClass,
      maxHp,
      movementModes,
      damageType,
      attacks,
      amorphousForm,
      hover,
    }) => {
      const block = buildElementalSpiritStatBlock({
        form,
        slotLevel,
        spellAttackBonus: 11,
      });

      expect(block).toEqual(
        expect.objectContaining({
          kind: "elemental-spirit",
          form,
          slotLevel,
          armorClass,
          maxHp,
          speed: 40,
          movementModes,
        }),
      );
      expect(block.attack).toEqual(
        expect.objectContaining({
          name: "Slam",
          attackBonus: 11,
          damageDice: "1d10",
          damageBonus: 4 + slotLevel,
          damageType,
          attacksPerAction: attacks,
        }),
      );
      expect(block.traits.amorphousForm).toBe(amorphousForm);
      expect(block.traits.hover).toBe(hover);
    },
  );
});

describe("Otherworldly Steed stat block", () => {
  it.each([
    {
      creatureType: "celestial" as const,
      slotLevel: 2,
      armorClass: 12,
      maxHp: 25,
      damageType: "radiant",
      bonusAction: "healing-touch",
      fly: undefined,
    },
    {
      creatureType: "fey" as const,
      slotLevel: 4,
      armorClass: 14,
      maxHp: 45,
      damageType: "psychic",
      bonusAction: "fey-step",
      fly: 60,
    },
    {
      creatureType: "fiend" as const,
      slotLevel: 5,
      armorClass: 15,
      maxHp: 55,
      damageType: "necrotic",
      bonusAction: "fell-glare",
      fly: 60,
    },
  ])(
    "calcula o corcel $creatureType no slot $slotLevel",
    ({
      creatureType,
      slotLevel,
      armorClass,
      maxHp,
      damageType,
      bonusAction,
      fly,
    }) => {
      const block = buildOtherworldlySteedStatBlock({
        appearance: "horse",
        creatureType,
        slotLevel,
        spellAttackBonus: 8,
        spellSaveDc: 16,
      });

      expect(block).toEqual(
        expect.objectContaining({
          kind: "otherworldly-steed",
          form: "horse",
          slotLevel,
          armorClass,
          maxHp,
          speed: 60,
        }),
      );
      expect(block.movementModes.fly).toBe(fly);
      expect(block.attack).toEqual(
        expect.objectContaining({
          name: "Otherworldly Slam",
          attackBonus: 8,
          damageDice: "1d8",
          damageBonus: slotLevel,
          damageType,
        }),
      );
      expect(block.traits.lifeBond).toBe(true);
      expect(block.steed).toEqual({
        creatureType,
        spellSaveDc: 16,
        bonusAction,
      });
    },
  );
});

describe("Summon metadata", () => {
  const familiar = {
    appliedEffects: [
      {
        kind: "summon",
        refId: "find-familiar-spell",
        targetParticipantId: null,
        metadata: {
          source: "find-familiar-spell",
          familiarForm: "owl",
          familiarCreatureType: "fey",
          cannotAttack: true,
        },
      },
    ],
  } as any;

  it("identifica Find Familiar sem depender do stat block do animal", () => {
    expect(isFindFamiliarSummon(familiar)).toBe(true);
    expect(getSummonMetadata(familiar)).toEqual(
      expect.objectContaining({
        source: "find-familiar-spell",
        familiarForm: "owl",
        familiarCreatureType: "fey",
        cannotAttack: true,
      }),
    );
  });

  it("não classifica outros summons como familiar", () => {
    expect(
      isFindFamiliarSummon({
        appliedEffects: [
          {
            kind: "summon",
            refId: "summon-beast-spell",
            targetParticipantId: null,
          },
        ],
      } as any),
    ).toBe(false);
  });

  it("identifica o vínculo de Find Steed", () => {
    expect(
      isFindSteedSummon({
        appliedEffects: [
          {
            kind: "summon",
            refId: "find-steed-spell",
            targetParticipantId: null,
            metadata: { source: "find-steed-spell" },
          },
        ],
      } as any),
    ).toBe(true);
    expect(isFindSteedSummon(familiar)).toBe(false);
  });
});
