import { CombatService } from "./combat.service";

function participant(
  id: string,
  overrides: Record<string, unknown> = {},
): any {
  return {
    id,
    encounterId: "enc-volley",
    type: "monster",
    displayName: id,
    faction: "enemy",
    positionX: 0,
    positionY: 0,
    conditions: [],
    conditionInstances: [],
    isDefeated: false,
    dyingState: "none",
    actionUsed: false,
    attacksUsedThisTurn: 0,
    attacksMaxThisTurn: 2,
    ...overrides,
  };
}

function createHarness() {
  const ranger = participant("ranger", {
    type: "pc",
    characterId: "char-ranger",
    displayName: "Lia",
    faction: "ally",
    positionX: 0,
    positionY: 0,
  });
  const targetA = participant("target-a", {
    displayName: "Goblin A",
    positionX: 11,
    positionY: 0,
  });
  const targetB = participant("target-b", {
    displayName: "Goblin B",
    positionX: 11,
    positionY: 1,
  });
  const participants = new Map(
    [ranger, targetA, targetB].map((entry) => [entry.id, entry]),
  );
  const encounter = {
    id: "enc-volley",
    sessionId: "session-volley",
    status: "active",
    turnOrder: [ranger.id, targetA.id, targetB.id],
    currentTurnIndex: 0,
    currentRound: 3,
  };
  const weapon = {
    id: "weapon-shortbow",
    name: "Shortbow",
    timing: "action",
    source: "weapon",
    sourceLabel: "Arma",
    description: "Ataque com Shortbow.",
    attackBonus: 8,
    damage: { dice: "1d6", type: "Piercing", bonus: 4 },
    range: "80/320 ft",
    weaponCategory: "ranged",
  };
  const volley = {
    id: "feature-volley-shortbow",
    name: "Saraivada (Volley) — Shortbow",
    timing: "action",
    source: "feature",
    sourceLabel: "Patrulheiro · Caçador",
    description: "Ataques separados.",
    featureSlug: "volley-ranger-hunter-11-phb",
    weaponActionSlug: weapon.id,
    aoe: {
      originType: "point",
      shape: "sphere",
      sizeFt: 10,
      rangeFt: 320,
    },
  };

  const participantRepo = {
    update: jest.fn(
      async (id: string, patch: Record<string, unknown>) => {
        Object.assign(participants.get(id)!, patch);
        return { affected: 1 };
      },
    ),
  };
  const eventService = {
    emit: jest.fn(async () => []),
  };
  const combat = Object.create(CombatService.prototype) as CombatService;
  Object.assign(combat as any, {
    encounterRepo: {
      findOne: jest.fn(async () => encounter),
    },
    encounterService: {
      getParticipant: jest.fn(async (id: string) => {
        const found = participants.get(id);
        if (!found) throw new Error(`missing ${id}`);
        return found;
      }),
      resolveCharacterOwner: jest.fn(async () => "owner-ranger"),
    },
    participantRepo,
    conditionEffects: {
      canTakeAction: jest.fn(() => true),
    },
    actionsService: {
      getActions: jest.fn(async () => ({
        actions: [weapon, volley],
        bonusActions: [],
      })),
    },
    sessionService: {
      getById: jest.fn(async () => ({ campaignId: "campaign" })),
    },
    eventService,
    encounterEndDetector: {
      tryAutoEnd: jest.fn(async () => null),
    },
  });

  const attackResults = [
    {
      attackRoll: {
        roll: 20,
        modifier: 8,
        total: 28,
        targetAc: 15,
        hit: true,
        critical: true,
        criticalMiss: false,
      },
      damageRoll: {
        rolls: [],
        bonus: 4,
        total: 12,
        type: "Piercing",
        resisted: false,
        immune: false,
        vulnerable: false,
        finalDamage: 12,
      },
      targetHpBefore: 20,
      targetHpAfter: 8,
      targetDefeated: false,
    },
    {
      attackRoll: {
        roll: 7,
        modifier: 8,
        total: 15,
        targetAc: 16,
        hit: false,
        critical: false,
        criticalMiss: false,
      },
      damageRoll: undefined,
      targetHpBefore: 20,
      targetHpAfter: 20,
      targetDefeated: false,
    },
  ];
  jest
    .spyOn(combat, "resolveAttack")
    .mockImplementation(async (_encounterId, dto) => {
      const index = dto.targetParticipantId === targetA.id ? 0 : 1;
      return {
        ok: true,
        value: attackResults[index],
        events: [
          {
            event_type: "attack_roll",
            actor_participant_id: ranger.id,
            target_participant_id: dto.targetParticipantId,
            data: attackResults[index].attackRoll,
          },
        ],
      } as any;
    });

  return {
    combat,
    encounter,
    participants,
    ranger,
    targetA,
    targetB,
    participantRepo,
    eventService,
  };
}

describe("CombatService — Ranger Hunter Volley (PHB 2014)", () => {
  it("resolve uma rolagem independente por criatura e persiste uma única Action", async () => {
    const h = createHarness();

    const result = await h.combat.resolveVolley(h.encounter.id, {
      attackerParticipantId: h.ranger.id,
      actionSlug: "feature-volley-shortbow",
      originCell: { x: 10, y: 0 },
      targetParticipantIds: [h.targetA.id, h.targetB.id],
      ownerUserId: "requester",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      kind: "volley",
      actionConsumed: true,
      weaponActionSlug: "weapon-shortbow",
      originCell: { x: 10, y: 0 },
      interruptedAt: null,
    });
    expect(result.value.attacks).toHaveLength(2);
    expect(result.value.attacks[0]).toMatchObject({
      targetParticipantId: h.targetA.id,
      attackRoll: { roll: 20, critical: true, hit: true },
      damageRoll: { finalDamage: 12 },
    });
    expect(result.value.attacks[1]).toMatchObject({
      targetParticipantId: h.targetB.id,
      attackRoll: { roll: 7, critical: false, hit: false },
    });
    expect(h.combat.resolveAttack).toHaveBeenNthCalledWith(
      1,
      h.encounter.id,
      expect.objectContaining({
        actionSlug: "weapon-shortbow",
        targetParticipantId: h.targetA.id,
        _skipActionConsumption: true,
        _deferAutoEnd: true,
      }),
    );
    expect(h.combat.resolveAttack).toHaveBeenNthCalledWith(
      2,
      h.encounter.id,
      expect.objectContaining({
        actionSlug: "weapon-shortbow",
        targetParticipantId: h.targetB.id,
        _skipActionConsumption: true,
        _deferAutoEnd: true,
      }),
    );
    expect(
      (h.combat.resolveAttack as jest.Mock).mock.calls[0][1],
    ).not.toHaveProperty("_isSubAttack");
    expect(h.participantRepo.update).toHaveBeenCalledWith(h.ranger.id, {
      actionUsed: true,
      attacksUsedThisTurn: 2,
    });
    expect(
      h.participantRepo.update.mock.invocationCallOrder[0],
    ).toBeLessThan(
      (h.combat.resolveAttack as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(h.ranger.actionUsed).toBe(true);
    expect(h.eventService.emit).toHaveBeenCalledWith(
      "session-volley",
      h.encounter.id,
      [expect.objectContaining({ event_type: "volley_started" })],
    );
    expect(h.eventService.emit).toHaveBeenCalledWith(
      "session-volley",
      h.encounter.id,
      [
        expect.objectContaining({
          event_type: "volley_resolved",
          data: expect.objectContaining({
            attackCount: 2,
            requestedAttackCount: 2,
            hits: 1,
            criticalHits: 1,
            totalDamage: 12,
            interruptedAt: null,
            status: "resolved",
          }),
        }),
      ],
    );

    const afterReload = await h.combat.resolveVolley(h.encounter.id, {
      attackerParticipantId: h.ranger.id,
      actionSlug: "feature-volley-shortbow",
      originCell: { x: 10, y: 0 },
      targetParticipantIds: [h.targetA.id],
      ownerUserId: "requester",
    });
    expect(afterReload).toMatchObject({
      ok: false,
      code: "NO_ACTION_AVAILABLE",
    });
    expect(h.combat.resolveAttack).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      label: "ponto além do alcance da arma",
      originCell: { x: 65, y: 0 },
      targets: ["target-a"],
      expectedCode: "OUT_OF_RANGE",
    },
    {
      label: "criatura fora do raio de 10 pés",
      originCell: { x: 8, y: 0 },
      targets: ["target-a"],
      expectedCode: "TARGET_OUTSIDE_AREA",
    },
    {
      label: "mesma criatura repetida",
      originCell: { x: 10, y: 0 },
      targets: ["target-a", "target-a"],
      expectedCode: "INVALID_PAYLOAD",
    },
  ])(
    "rejeita $label antes de qualquer ataque",
    async ({ originCell, targets, expectedCode }) => {
      const h = createHarness();

      const result = await h.combat.resolveVolley(h.encounter.id, {
        attackerParticipantId: h.ranger.id,
        actionSlug: "feature-volley-shortbow",
        originCell,
        targetParticipantIds: targets,
        ownerUserId: "requester",
      });

      expect(result).toMatchObject({ ok: false, code: expectedCode });
      expect(h.combat.resolveAttack).not.toHaveBeenCalled();
      expect(h.participantRepo.update).not.toHaveBeenCalled();
    },
  );

  it("rejeita quando a Action já foi gasta", async () => {
    const h = createHarness();
    h.ranger.actionUsed = true;

    const result = await h.combat.resolveVolley(h.encounter.id, {
      attackerParticipantId: h.ranger.id,
      actionSlug: "feature-volley-shortbow",
      originCell: { x: 10, y: 0 },
      targetParticipantIds: [h.targetA.id],
      ownerUserId: "requester",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "NO_ACTION_AVAILABLE",
    });
    expect(h.combat.resolveAttack).not.toHaveBeenCalled();
  });

  it("rejeita criatura além do alcance longo mesmo quando está no raio do ponto", async () => {
    const h = createHarness();
    h.targetA.positionX = 66;
    h.targetA.positionY = 0;

    const result = await h.combat.resolveVolley(h.encounter.id, {
      attackerParticipantId: h.ranger.id,
      actionSlug: "feature-volley-shortbow",
      originCell: { x: 64, y: 0 },
      targetParticipantIds: [h.targetA.id],
      ownerUserId: "requester",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "OUT_OF_RANGE",
    });
    expect(h.combat.resolveAttack).not.toHaveBeenCalled();
    expect(h.participantRepo.update).not.toHaveBeenCalled();
  });

  it("usa a mesma geometria circular euclidiana do preview da tela", async () => {
    const h = createHarness();
    h.targetA.positionX = 12;
    h.targetA.positionY = 2;

    const result = await h.combat.resolveVolley(h.encounter.id, {
      attackerParticipantId: h.ranger.id,
      actionSlug: "feature-volley-shortbow",
      originCell: { x: 10, y: 0 },
      targetParticipantIds: [h.targetA.id],
      ownerUserId: "requester",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "TARGET_OUTSIDE_AREA",
    });
    expect(h.combat.resolveAttack).not.toHaveBeenCalled();
    expect(h.participantRepo.update).not.toHaveBeenCalled();
  });

  it("mantém a Action consumida e registra interrupção se um ataque posterior falhar", async () => {
    const h = createHarness();
    (h.combat.resolveAttack as jest.Mock)
      .mockImplementationOnce(async () => ({
        ok: true,
        value: {
          attackRoll: {
            roll: 15,
            modifier: 8,
            total: 23,
            targetAc: 15,
            hit: true,
            critical: false,
            criticalMiss: false,
          },
          damageRoll: {
            rolls: [4],
            bonus: 4,
            total: 8,
            type: "Piercing",
            resisted: false,
            immune: false,
            vulnerable: false,
            finalDamage: 8,
          },
          targetHpBefore: 20,
          targetHpAfter: 12,
          targetDefeated: false,
        },
        events: [],
      }))
      .mockImplementationOnce(async () => ({
        ok: false,
        code: "CONDITION_PREVENTS_ACTION",
        error: "Alvo deixou de ser válido.",
      }));

    const result = await h.combat.resolveVolley(h.encounter.id, {
      attackerParticipantId: h.ranger.id,
      actionSlug: "feature-volley-shortbow",
      originCell: { x: 10, y: 0 },
      targetParticipantIds: [h.targetA.id, h.targetB.id],
      ownerUserId: "requester",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        actionConsumed: true,
        attacks: [{ targetParticipantId: h.targetA.id }],
        interruptedAt: {
          targetParticipantId: h.targetB.id,
          reason: "action_cancelled",
          code: "CONDITION_PREVENTS_ACTION",
        },
      },
    });
    expect(h.ranger.actionUsed).toBe(true);
    expect(h.participantRepo.update).toHaveBeenCalledTimes(1);
    expect(h.eventService.emit).toHaveBeenLastCalledWith(
      "session-volley",
      h.encounter.id,
      [
        expect.objectContaining({
          event_type: "volley_resolved",
          data: expect.objectContaining({
            attackCount: 1,
            requestedAttackCount: 2,
            status: "interrupted",
          }),
        }),
      ],
    );

    const replay = await h.combat.resolveVolley(h.encounter.id, {
      attackerParticipantId: h.ranger.id,
      actionSlug: "feature-volley-shortbow",
      originCell: { x: 10, y: 0 },
      targetParticipantIds: [h.targetB.id],
      ownerUserId: "requester",
    });
    expect(replay).toMatchObject({
      ok: false,
      code: "NO_ACTION_AVAILABLE",
    });
    expect(h.combat.resolveAttack).toHaveBeenCalledTimes(2);
  });
});
