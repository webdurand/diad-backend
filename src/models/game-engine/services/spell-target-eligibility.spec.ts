import { isHumanoidSpellTarget } from "./spell-target-eligibility";

describe("spell target eligibility", () => {
  it("aceita PCs e NPCs humanoides sem ficha de monstro", () => {
    expect(isHumanoidSpellTarget({ type: "pc" } as never)).toBe(true);
    expect(isHumanoidSpellTarget({ type: "npc" } as never)).toBe(true);
  });

  it("aceita monstros humanoides e rejeita outros tipos", () => {
    expect(
      isHumanoidSpellTarget({
        type: "monster",
        monster: { type: "Humanoid (goblinoid)" },
      } as never),
    ).toBe(true);
    expect(
      isHumanoidSpellTarget({
        type: "monster",
        monster: { type: "Dragon" },
      } as never),
    ).toBe(false);
  });
});
