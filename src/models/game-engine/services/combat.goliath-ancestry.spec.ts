import { CombatService } from "./combat.service";

describe("CombatService — Giant Ancestry triggers", () => {
  function setup(choice: string, used = 0) {
    const service = Object.create(CombatService.prototype) as any;
    service.resolveParticipantOwner = jest.fn().mockResolvedValue("owner-1");
    service.sheetService = {
      computeSheet: jest.fn().mockResolvedValue({
        race: { slug: "goliath" },
        proficiencyBonus: 6,
        abilityScores: [{ slug: "con", modifier: 3 }],
        originDetails: { raceTraitChoices: [choice] },
      }),
    };
    service.stateService = {
      getFeatureUsesUsed: jest
        .fn()
        .mockResolvedValue({ "giant-ancestry": used }),
    };
    service.effectInstances = {
      removeEffect: jest.fn().mockResolvedValue({ events: [] }),
      addEffect: jest.fn(async (participant: any, input: any) => {
        const effect = { id: "pending-1", ...input };
        participant.effectInstances = [
          ...(participant.effectInstances ?? []),
          effect,
        ];
        return { effect, events: [] };
      }),
    };
    const goliath = {
      id: "goliath-1",
      type: "pc",
      characterId: "character-1",
      displayName: "Golias",
      positionX: 5,
      positionY: 5,
      reactionsUsed: 0,
      conditions: [],
      effectInstances: [],
    };
    const ogre = {
      id: "ogre-1",
      type: "monster",
      displayName: "Ogro",
      positionX: 6,
      positionY: 5,
      isDefeated: false,
      effectInstances: [],
      monster: { size: "Large" },
    };
    return { service, goliath, ogre };
  }

  it("oferece o benefício de acerto escolhido e arma um único pending", async () => {
    const { service, goliath, ogre } = setup("Frost's Chill", 2);
    const events: any[] = [];

    const result = await service.maybeOfferGiantAncestryOnHit(
      goliath,
      ogre,
      "owner-1",
      events,
    );

    expect(result).toBe("frosts-chill");
    expect(service.effectInstances.addEffect).toHaveBeenCalledWith(
      goliath,
      expect.objectContaining({
        kind: "giant_ancestry_hit_pending",
        sourceFeatureSlug: "frosts-chill",
        payload: expect.objectContaining({
          requiredTargetId: ogre.id,
          usesRemaining: 4,
          usesMax: 6,
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        event_type: "giant_ancestry_available",
        data: expect.objectContaining({ featureSlug: "frosts-chill" }),
      }),
    );
  });

  it("oferece reação escolhida somente com reação e usos disponíveis", async () => {
    const { service, goliath, ogre } = setup("Stone's Endurance", 5);
    const events: any[] = [];

    const offered = await service.maybeOfferGiantAncestryReaction(
      {
        turnOrder: [ogre.id],
        currentTurnIndex: 0,
      },
      ogre,
      goliath,
      "owner-1",
      "damage-event-1",
      80,
      70,
      0,
      10,
      "slashing",
      events,
    );

    expect(offered).toBe(true);
    expect(service.effectInstances.addEffect).toHaveBeenCalledWith(
      goliath,
      expect.objectContaining({
        kind: "giant_ancestry_reaction_pending",
        sourceFeatureSlug: "stones-endurance",
        payload: expect.objectContaining({
          triggerEventId: "damage-event-1",
          incomingDamage: 10,
          usesRemaining: 1,
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        event_type: "giant_ancestry_reaction_opportunity",
      }),
    );
  });
});
