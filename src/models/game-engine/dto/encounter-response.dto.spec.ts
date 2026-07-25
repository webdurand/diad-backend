import { toEnrichedEncounterResponse } from "./encounter-response.dto";

describe("toEnrichedEncounterResponse", () => {
  it("preserva a ficha do monstro necessária para XP e stat block em tela", () => {
    const monster = {
      id: "monster-troll",
      name: "Troll",
      type: "giant",
      xp: 1800,
      challenge_rating: 5,
    };
    const encounter = {
      id: "encounter-1",
      sessionId: "session-1",
      name: "Arena",
      status: "preparing",
      currentRound: 1,
      currentTurnIndex: 0,
      turnOrder: [],
      mapData: {},
      participants: [
        {
          id: "participant-troll",
          encounterId: "encounter-1",
          type: "monster",
          monsterId: "monster-troll",
          monster,
          displayName: "Troll",
          faction: "enemy",
          currentHp: 84,
          maxHp: 84,
          controlledBy: "ai",
        },
      ],
      createdAt: new Date("2026-07-24T00:00:00.000Z"),
      updatedAt: new Date("2026-07-24T00:00:00.000Z"),
    };

    const response = toEnrichedEncounterResponse(encounter as any);

    expect(response.participants[0]).toEqual(
      expect.objectContaining({
        creatureType: "giant",
        monster: expect.objectContaining({
          id: "monster-troll",
          xp: 1800,
          challenge_rating: 5,
        }),
      }),
    );
  });
});
