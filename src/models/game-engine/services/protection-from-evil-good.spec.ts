import {
  participantCreatureType,
  protectionBlocksCondition,
  protectionDisadvantagesAttack,
} from "./protection-from-evil-good";

const protection = [
  {
    id: "effect-1",
    kind: "protection_from_evil_good",
    sourceSpellSlug: "protection-from-evil-and-good",
    expiresAt: { kind: "concentration" },
    payload: {},
  },
] as never;

describe("Protection from Evil and Good", () => {
  it.each(["undead", "fey", "fiend", "elemental", "celestial", "aberration"])(
    "causes disadvantage and blocks Charmed/Frightened from %s",
    (type) => {
      const attacker = {
        type: "monster",
        monster: { type },
        appliedEffects: [],
      } as never;
      expect(protectionDisadvantagesAttack(protection, attacker)).toBe(true);
      expect(protectionBlocksCondition(protection, "charmed", type)).toBe(true);
      expect(protectionBlocksCondition(protection, "frightened", type)).toBe(
        true,
      );
    },
  );

  it("does not protect against a Dragon or unrelated conditions", () => {
    const dragon = {
      type: "monster",
      monster: { type: "dragon" },
      appliedEffects: [],
    } as never;
    expect(protectionDisadvantagesAttack(protection, dragon)).toBe(false);
    expect(protectionBlocksCondition(protection, "paralyzed", "undead")).toBe(
      false,
    );
  });

  it("recognizes the creature type selected for an Otherworldly Steed", () => {
    expect(
      participantCreatureType({
        type: "monster",
        monster: undefined,
        appliedEffects: [
          {
            kind: "summon",
            refId: "steed",
            targetParticipantId: null,
            description: "steed",
            metadata: {
              statBlock: {
                kind: "otherworldly-steed",
                steed: { creatureType: "fey" },
              },
            },
          },
        ],
      } as never),
    ).toBe("fey");
  });
});
