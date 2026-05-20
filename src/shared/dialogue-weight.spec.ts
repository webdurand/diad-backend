import { getDialogueWeight } from "./dialogue-weight";

describe("getDialogueWeight", () => {
  it.each([
    [{ narrativeRole: "tavern_owner", profileDepth: "supporting", tags: [] }, "plot"],
    [{ narrativeRole: "mentor", profileDepth: "expanded", tags: [] }, "plot"],
    [{ narrativeRole: "mentor", profileDepth: "core", tags: [] }, "ambient"],
    [{ narrativeRole: null, profileDepth: "core", tags: ["quest_giver"] }, "plot"],
    [{ narrativeRole: null, profileDepth: "core", tags: ["secret_holder"] }, "plot"],
    [{ narrativeRole: null, profileDepth: "supporting", tags: [] }, "flavor"],
    [{ narrativeRole: undefined, profileDepth: "supporting", tags: ["vendor"] }, "flavor"],
    [{ narrativeRole: undefined, profileDepth: "expanded", tags: ["vendor"] }, "ambient"],
    [{ narrativeRole: "", profileDepth: "core", tags: [] }, "ambient"],
    [{ narrativeRole: null, profileDepth: "core", tags: ["public_hook:rumor_amulet"] }, "ambient"],
    [{ narrativeRole: null, profileDepth: "supporting", tags: ["quest_giver"] }, "plot"],
    [{ narrativeRole: "guard_captain", profileDepth: "supporting", tags: ["secret_holder"] }, "plot"],
  ] as const)("derives %s as %s", (npc, expected) => {
    expect(getDialogueWeight(npc)).toBe(expected);
  });
});
