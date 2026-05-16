import { selectAliveNpcIds } from "../domain/npc-state-snapshot";

describe("NpcStateSnapshot", () => {
  it("npcsAliveAtEndOfPhase ignora npcs com deathStatus='dead'", () => {
    const alive = selectAliveNpcIds([
      { npcId: "11111111-1111-4111-8111-111111111111", deathStatus: "alive" },
      { npcId: "22222222-2222-4222-8222-222222222222", deathStatus: "dead" },
      { npcId: "33333333-3333-4333-8333-333333333333", status: "missing" },
      { npcId: "44444444-4444-4444-8444-444444444444", status: "dead" },
    ]);

    expect(alive).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });
});
