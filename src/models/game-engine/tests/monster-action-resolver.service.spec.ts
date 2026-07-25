import { MonsterActionResolver } from "../services/monster-action-resolver.service";

describe("MonsterActionResolver", () => {
  let resolver: MonsterActionResolver;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    resolver = new MonsterActionResolver();
    warnSpy = jest
      .spyOn(resolver["logger"], "warn")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("uses structured attack_bonus when present", () => {
    const action = {
      name: "Scimitar",
      desc: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.",
      attack_bonus: 4,
      damage: [{ damage_dice: "1d6+2", damage_type: { name: "slashing" } }],
    };

    const resolved = resolver.resolve(action, "Goblin");

    expect(resolved.attackBonus).toBe(4);
    expect(resolved.attackBonusSource).toBe("structured");
    expect(resolved.damageDice).toBe("1d6+2");
    expect(resolved.damageType).toBe("slashing");
    expect(resolved.hasAttack).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to "+X to hit" regex when structured bonus missing', () => {
    const action = {
      name: "Bite",
      desc: "Melee Weapon Attack: +7 to hit, reach 5 ft., one target.",
    };

    const resolved = resolver.resolve(action, "Owlbear");

    expect(resolved.attackBonus).toBe(7);
    expect(resolved.attackBonusSource).toBe("regex");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("handles negative bonuses in regex", () => {
    const action = {
      name: "Weak Slap",
      desc: "Melee Weapon Attack: -1 to hit, reach 5 ft.",
    };

    const resolved = resolver.resolve(action, "Commoner");

    expect(resolved.attackBonus).toBe(-1);
    expect(resolved.attackBonusSource).toBe("regex");
  });

  it("returns 0 with warning when action looks like an attack but has no bonus info", () => {
    const action = {
      name: "Broken Attack",
      desc: "Melee Weapon Attack with an attack roll against the target.",
    };

    const resolved = resolver.resolve(action, "BadData");

    expect(resolved.attackBonus).toBe(0);
    expect(resolved.attackBonusSource).toBe("fallback");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/BadData\/Broken Attack/);
  });

  it("does not warn for non-attack actions (saves/features)", () => {
    const action = {
      name: "Fire Breath",
      desc: "The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw.",
    };

    const resolved = resolver.resolve(action, "AdultRedDragon");

    expect(resolved.attackBonus).toBe(0);
    expect(resolved.attackBonusSource).toBe("none");
    expect(resolved.hasAttack).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("derives damage from description when structured damage missing", () => {
    const action = {
      name: "Club",
      desc: "Melee Weapon Attack: +2 to hit. Hit: (1d4) bludgeoning damage.",
    };

    const resolved = resolver.resolve(action, "Kobold");

    expect(resolved.damageDice).toBe("1d4");
    expect(resolved.damageType).toBe("bludgeoning");
  });

  it("recognizes a restraining attack with an escape check and no damage", () => {
    const action = {
      name: "Web",
      desc: "Ranged Weapon Attack: +5 to hit, range 30/60 ft., one creature. Hit: The target is restrained by webbing. As an action, the restrained target can make a DC 12 Strength check, bursting the webbing on a success.",
      attack_bonus: 5,
    };

    const resolved = resolver.resolve(action, "Giant Spider");

    expect(resolved.damageDice).toBeUndefined();
    expect(resolved.onHitCondition).toEqual({
      slug: "restrained",
      saveAbility: "str",
      saveDc: 12,
    });
  });

  it("parses Giant Spider Bite poison as save-for-half secondary damage", () => {
    const action = {
      name: "Bite",
      desc: "Melee Weapon Attack: +5 to hit, reach 5 ft., one creature. Hit: 7 (1d8 + 3) piercing damage, and the target must make a DC 11 Constitution saving throw, taking 9 (2d8) poison damage on a failed save, or half as much damage on a successful one. If the poison damage reduces the target to 0 hit points, the target is stable but poisoned for 1 hour, even after regaining hit points, and is paralyzed while poisoned in this way.",
      attack_bonus: 5,
      damage: [
        {
          damage_type: { name: "Piercing" },
          damage_dice: "1d8+3",
        },
      ],
    };

    const resolved = resolver.resolve(action, "Giant Spider");

    expect(resolved.damageDice).toBe("1d8+3");
    expect(resolved.damageType).toBe("piercing");
    expect(resolved.secondarySaveDamage).toEqual({
      saveAbility: "con",
      saveDc: 11,
      damageDice: "2d8",
      damageType: "poison",
      halfOnSuccess: true,
      zeroHpEffect: {
        stable: true,
        conditions: ["poisoned", "paralyzed"],
        durationRounds: 600,
      },
    });
  });

  it("parses Ghoul Claws as a repeatable Constitution save against paralysis", () => {
    const resolved = resolver.resolve(
      {
        name: "Claws",
        desc: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) slashing damage. If the target is a creature other than an elf or undead, it must succeed on a DC 10 Constitution saving throw or be paralyzed for 1 minute. The target can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success.",
      },
      "Ghoul",
    );

    expect(resolved.onHitSaveCondition).toEqual({
      slug: "paralyzed",
      saveAbility: "con",
      saveDc: 10,
      durationRounds: 10,
      repeatSaveTiming: "end_of_turn",
      excludedCreatureTypes: ["undead"],
      excludedRaceTerms: ["elf"],
    });
  });

  it("parses Frightful Presence as a targeted Wisdom save condition action", () => {
    const resolved = resolver.resolve(
      {
        name: "Frightful Presence",
        desc: "Each creature of the dragon's choice that is within 120 feet of the dragon and aware of it must succeed on a DC 16 Wisdom saving throw or become frightened for 1 minute. A creature can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success.",
      },
      "Adult Black Dragon",
    );

    expect(resolved.hasAttack).toBe(false);
    expect(resolved.range).toBe("120 ft.");
    expect(resolved.saveConditionAction).toEqual({
      slug: "frightened",
      saveAbility: "wis",
      saveDc: 16,
      rangeFt: 120,
      durationRounds: 10,
      repeatSaveTiming: "end_of_turn",
    });
  });

  it.each([
    ["Fey Charm", "Dryad", 14],
    ["Charm", "Succubus/Incubus", 15],
  ])("parses %s as a charmed save action", (name, monsterName, dc) => {
    const resolved = resolver.resolve(
      {
        name,
        desc: `The ${monsterName} targets one creature it can see within 30 ft. of it. The target must succeed on a DC ${dc} Wisdom saving throw or be magically charmed for 24 hours.`,
      },
      monsterName,
    );

    expect(resolved.saveConditionAction).toEqual({
      slug: "charmed",
      saveAbility: "wis",
      saveDc: dc,
      rangeFt: 30,
      durationRounds: 14400,
      repeatSaveTiming: "never",
    });
  });

  it("resolveByName finds action case-insensitively", () => {
    const monster = {
      name: "Owlbear",
      actions: [
        { name: "Multiattack", desc: "The owlbear makes two attacks." },
        {
          name: "Beak",
          desc: "Melee Weapon Attack: +7 to hit.",
          attack_bonus: 7,
        },
      ],
    };

    const resolved = resolver.resolveByName(monster, "beak");
    expect(resolved).not.toBeNull();
    expect(resolved!.attackBonus).toBe(7);
  });

  it("resolveByName returns null for unknown action", () => {
    const monster = {
      name: "Owlbear",
      actions: [{ name: "Beak", desc: "+7 to hit" }],
    };

    expect(resolver.resolveByName(monster, "Fire Breath")).toBeNull();
  });
});
