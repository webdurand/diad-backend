import {
  checkSpellPreconditions,
  materializeSpellEffects,
} from "./spell-effect-catalog";

describe("spell effect catalog", () => {
  it("materializes Mage Armor as 13 + target DEX for 8 hours", () => {
    const [effect] = materializeSpellEffects("mage-armor", {
      casterParticipantId: "caster",
      targetParticipantIds: ["target"],
      slotLevel: 1,
      casterDexModifier: 1,
      targetDexModifiers: { target: 4 },
    });

    expect(effect).toMatchObject({
      targetParticipantId: "target",
      input: {
        kind: "ac_base_override",
        payload: { amount: 17 },
        expiresAt: { kind: "rounds", value: 4_800 },
        requiresConcentration: false,
      },
    });
  });

  it("materializes Shield of Faith as +2 AC on the selected target while concentrating", () => {
    const [effect] = materializeSpellEffects("shield-of-faith-xphb", {
      casterParticipantId: "caster",
      targetParticipantIds: ["ally"],
      slotLevel: 1,
    });

    expect(effect).toMatchObject({
      targetParticipantId: "ally",
      input: {
        kind: "ac_bonus",
        sourceSpellSlug: "shield-of-faith",
        sourceCasterParticipantId: "caster",
        payload: { amount: 2 },
        expiresAt: { kind: "concentration" },
        requiresConcentration: true,
      },
    });
  });

  it("materializes Protection from Evil and Good on the selected target", () => {
    const [effect] = materializeSpellEffects(
      "protection-from-evil-and-good-xphb",
      {
        casterParticipantId: "caster",
        targetParticipantIds: ["ally"],
        slotLevel: 1,
      },
    );

    expect(effect).toMatchObject({
      targetParticipantId: "ally",
      input: {
        kind: "protection_from_evil_good",
        sourceSpellSlug: "protection-from-evil-and-good",
        sourceCasterParticipantId: "caster",
        expiresAt: { kind: "concentration" },
        requiresConcentration: true,
        payload: {
          creatureTypes: expect.arrayContaining([
            "aberration",
            "celestial",
            "elemental",
            "fey",
            "fiend",
            "undead",
          ]),
        },
      },
    });
  });

  it("materializes Aid once per distinct target and scales by slot", () => {
    const effects = materializeSpellEffects("aid-xphb", {
      casterParticipantId: "caster",
      targetParticipantIds: ["caster", "ally", "ally", "third", "fourth"],
      slotLevel: 4,
    });

    expect(effects).toHaveLength(3);
    expect(effects.map((effect) => effect.targetParticipantId)).toEqual([
      "caster",
      "ally",
      "third",
    ]);
    expect(effects[0]?.input).toMatchObject({
      kind: "hit_point_maximum_bonus",
      sourceSpellSlug: "aid",
      payload: { amount: 15, slotLevel: 4 },
      expiresAt: { kind: "rounds", value: 4_800 },
      requiresConcentration: false,
    });
  });

  it("materializes one concentrated Beacon of Hope effect per distinct target", () => {
    const effects = materializeSpellEffects("beacon-of-hope", {
      casterParticipantId: "caster",
      targetParticipantIds: ["caster", "ally", "ally", "third", "fourth"],
      slotLevel: 3,
    });

    expect(effects).toHaveLength(4);
    expect(effects.map((effect) => effect.targetParticipantId)).toEqual([
      "caster",
      "ally",
      "third",
      "fourth",
    ]);
    expect(effects[0]?.input).toMatchObject({
      kind: "beacon_of_hope",
      sourceSpellSlug: "beacon-of-hope",
      sourceCasterParticipantId: "caster",
      expiresAt: { kind: "concentration" },
      requiresConcentration: true,
    });
  });

  it.each(["construct", "undead"])(
    "Heal rejeita criaturas do tipo %s",
    (type) => {
      expect(
        checkSpellPreconditions("heal", [
          {
            id: "target",
            isWearingArmor: false,
            participant: { monster: { type } } as never,
          },
        ]),
      ).toMatchObject({
        code: "INVALID_SPELL_TARGET",
        targetId: "target",
      });
    },
  );

  it("Heal aceita criaturas vivas", () => {
    expect(
      checkSpellPreconditions("heal-xphb", [
        {
          id: "target",
          isWearingArmor: false,
          participant: { monster: { type: "giant" } } as never,
        },
      ]),
    ).toBeNull();
  });
});
