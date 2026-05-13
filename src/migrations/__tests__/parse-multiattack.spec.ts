import { parseMultiattackFromDescription } from "../utils/parse-multiattack";

describe("parseMultiattackFromDescription", () => {
  it("returns null when description lacks a multiattack pattern", () => {
    expect(parseMultiattackFromDescription("The goblin hides.")).toBeNull();
  });

  it('parses owlbear "makes two attacks: one with its beak and one with its claws"', () => {
    const actions = [{ name: "Beak" }, { name: "Claws" }];
    const res = parseMultiattackFromDescription(
      "The owlbear makes two attacks: one with its beak and one with its claws.",
      actions,
    );
    expect(res).not.toBeNull();
    expect(res!.sequence).toEqual([
      { actionName: "Beak", count: 1 },
      { actionName: "Claws", count: 1 },
    ]);
  });

  it("parses bite + claw + tail triple attack", () => {
    const actions = [{ name: "Bite" }, { name: "Claw" }, { name: "Tail" }];
    const res = parseMultiattackFromDescription(
      "The dragon makes three attacks: one with its bite, one with its claws, and one with its tail.",
      actions,
    );
    expect(res).not.toBeNull();
    expect(res!.sequence).toEqual([
      { actionName: "Bite", count: 1 },
      { actionName: "Claw", count: 1 },
      { actionName: "Tail", count: 1 },
    ]);
  });

  it('parses "makes two scimitar attacks" as same-action repeat', () => {
    const actions = [{ name: "Scimitar" }];
    const res = parseMultiattackFromDescription(
      "The hobgoblin makes two scimitar attacks.",
      actions,
    );
    expect(res).not.toBeNull();
    expect(res!.sequence).toEqual([{ actionName: "Scimitar", count: 2 }]);
  });

  it('parses "makes three attacks with its longsword"', () => {
    const actions = [{ name: "Longsword" }];
    const res = parseMultiattackFromDescription(
      "The knight makes three attacks with its longsword.",
      actions,
    );
    expect(res).not.toBeNull();
    expect(res!.sequence).toEqual([{ actionName: "Longsword", count: 3 }]);
  });

  it("merges duplicate sub-actions into a single sequence entry", () => {
    const actions = [{ name: "Claws" }, { name: "Bite" }];
    const res = parseMultiattackFromDescription(
      "The beast makes three attacks: two with its claws and one with its bite.",
      actions,
    );
    expect(res).not.toBeNull();
    expect(res!.sequence).toEqual([
      { actionName: "Claws", count: 2 },
      { actionName: "Bite", count: 1 },
    ]);
  });

  it("falls back to title-cased label when action name is not in statblock", () => {
    const res = parseMultiattackFromDescription(
      "The chimera makes three attacks: one with its bite, one with its horns, and one with its claws.",
      [],
    );
    expect(res).not.toBeNull();
    expect(res!.sequence.length).toBe(3);
    expect(res!.sequence.map((s) => s.actionName)).toEqual([
      "Bite",
      "Horns",
      "Claws",
    ]);
  });

  it("preserves the raw description text", () => {
    const desc =
      "The owlbear makes two attacks: one with its beak and one with its claws.";
    const res = parseMultiattackFromDescription(desc, [
      { name: "Beak" },
      { name: "Claws" },
    ]);
    expect(res!.description).toBe(desc);
  });

  it("returns null for irrelevant action descriptions", () => {
    expect(
      parseMultiattackFromDescription(
        "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) slashing damage.",
      ),
    ).toBeNull();
  });
});
