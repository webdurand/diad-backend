import { AarakocraRitualService } from "./aarakocra-ritual.service";

describe("AarakocraRitualService lifecycle", () => {
  const ritualActionId = "aarakocra-mm-summon-air-elemental";
  const ids = ["a1", "a2", "a3", "a4", "a5"];
  const groupId = ids.join(":");

  function ritualEffect(participantId: string, progress: number, round: number) {
    return {
      id: `ritual-${participantId}`,
      sourceFeatureSlug: ritualActionId,
      sourceCasterParticipantId: participantId,
      kind: "summoning_ritual",
      payload: {
        ritualGroupId: groupId,
        ritualParticipantIds: ids,
        ritualProgress: progress,
        ritualLastRound: round,
      },
      expiresAt: { kind: "end_of_encounter" },
      requiresConcentration: true,
      appliedAt: "2026-07-26T00:00:00.000Z",
    };
  }

  it("persiste os cinco ritualistas, aplica cooldown individual e impede nova invocação", async () => {
    const encounter = {
      id: "enc-1",
      status: "active",
      turnOrder: ids,
      currentTurnIndex: 0,
      currentRound: 3,
    };
    const members = ids.map((id, index) => ({
      id,
      encounterId: encounter.id,
      displayName: `Aarakocra ${index + 1}`,
      type: "monster",
      monsterId: "aarakocra-monster",
      monster: { slug: "aarakocra" },
      faction: "ally",
      controlledBy: "pc",
      isDefeated: false,
      currentHp: 10,
      positionX: index,
      positionY: 0,
      actionUsed: false,
      movementRemaining: 50,
      rechargeState: {},
      effectInstances: [
        ritualEffect(id, index === 0 ? 2 : 3, index === 0 ? 2 : 3),
      ],
      isConcentrating: true,
      concentratingOn: "Summon Air Elemental ritual",
      concentrationRoundsRemaining: null,
      concentrationSaveDc: null,
    })) as any[];
    const participantSave = jest
      .fn()
      .mockImplementation(async (value: any) => value);
    const participants = {
      findOne: jest.fn().mockResolvedValue(members[0]),
      find: jest.fn().mockResolvedValue(members),
      findByIds: jest.fn().mockResolvedValue(members),
      save: participantSave,
    };
    const summon = {
      id: "air-1",
      displayName: "Air Elemental Invocado",
    };
    const summoning = {
      spawnSummon: jest.fn().mockResolvedValue(summon),
    };
    const service = new AarakocraRitualService(
      { findOne: jest.fn().mockResolvedValue(encounter) } as any,
      participants as any,
      { startNew: jest.fn() } as any,
      summoning as any,
    );

    const result = await service.perform(encounter.id, members[0].id);

    expect(result.ok).toBe(true);
    expect(summoning.spawnSummon).toHaveBeenCalledWith(
      encounter.id,
      expect.objectContaining({
        casterParticipantId: members[0].id,
        durationRoundsTotal: 600,
        concentrationLinked: false,
        source: "aarakocra-air-elemental-ritual",
        metadata: {
          ritualParticipantIds: ids,
          ritualParticipantNames: members.map((member) => member.displayName),
        },
      }),
    );
    for (const member of members) {
      expect(member.rechargeState[ritualActionId]).toBe("used");
      expect(member.effectInstances).toEqual([]);
      expect(member.isConcentrating).toBe(false);
    }

    members[0].actionUsed = false;
    const retry = await service.perform(encounter.id, members[0].id);
    expect(retry).toMatchObject({ ok: false, code: "NO_USES_REMAINING" });
    if (!retry.ok) {
      expect(retry.error).not.toMatch(/descanso/i);
      expect(retry.error).toMatch(/estado atual/i);
    }
  });
});
