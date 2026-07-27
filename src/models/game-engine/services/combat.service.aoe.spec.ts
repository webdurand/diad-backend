import { CombatService } from "./combat.service";
import { DiceService } from "./dice.service";
import { MonsterActionResolver } from "./monster-action-resolver.service";

describe("CombatService — area damage feedback", () => {
  it("includes authoritative PC HP when Evasion reduces area damage to zero", async () => {
    const caster = {
      id: "adult-black-dragon",
      encounterId: "encounter-aoe",
      type: "monster",
      displayName: "Adult Black Dragon",
      faction: "enemy",
      actionUsed: false,
      rechargeState: {},
      monster: {
        slug: "adult-black-dragon",
        name: "Adult Black Dragon",
        actions: [
          {
            name: "Acid Breath",
            desc: "The dragon exhales acid in a 60-foot line. Each creature in that line must make a DC 18 Dexterity saving throw, taking 54 (12d8) acid damage on a failed save, or half as much damage on a successful one.",
            damage: [
              {
                damage_dice: "12d8",
                damage_type: { name: "acid" },
              },
            ],
          },
        ],
      },
    };
    const ranger = {
      id: "ranger-hunter-15",
      encounterId: "encounter-aoe",
      type: "pc",
      characterId: "ranger-character",
      displayName: "Ranger Hunter 15",
      faction: "ally",
      currentHp: 999,
      conditions: [],
      isDefeated: false,
      transformationState: null,
    };
    const participants = new Map([
      [caster.id, caster],
      [ranger.id, ranger],
    ]);
    const encounter = {
      id: "encounter-aoe",
      sessionId: "session-aoe",
      status: "active",
      turnOrder: [caster.id, ranger.id],
      currentTurnIndex: 0,
    };
    const diceService = new DiceService();
    jest.spyOn(diceService, "rollExpression").mockReturnValue({
      expression: "12d8",
      rolls: [4, 5, 3, 6, 2, 7, 4, 5, 3, 6, 2, 7],
      modifier: 0,
      total: 54,
    });
    const stateService = {
      getCurrentHp: jest.fn(async () => 169),
      updateHp: jest.fn(),
    };
    const eventService = {
      emit: jest.fn(async () => []),
    };
    const participantRepo = {
      save: jest.fn(async (participant: unknown) => participant),
    };

    const combat = Object.create(CombatService.prototype) as CombatService;
    Object.assign(combat as any, {
      encounterRepo: {
        findOne: jest.fn(async () => encounter),
      },
      encounterService: {
        getParticipant: jest.fn(async (participantId: string) => {
          const participant = participants.get(participantId);
          if (!participant) throw new Error(`missing ${participantId}`);
          return participant;
        }),
        resolveCharacterOwner: jest.fn(async () => "ranger-owner"),
      },
      participantRepo,
      diceService,
      eventService,
      stateService,
      sessionService: {
        getById: jest.fn(async () => ({ campaignId: "campaign-aoe" })),
      },
      savingThrowService: {
        rollSavingThrow: jest.fn(async () => ({
          ok: true,
          value: {
            ability: "dex",
            dc: 18,
            roll: 20,
            modifier: 10,
            total: 30,
            success: true,
          },
          events: [],
        })),
      },
      sheetService: {
        computeSheet: jest.fn(async () => ({
          armorClass: 16,
          classes: [{ slug: "ranger-phb", level: 15 }],
          features: [
            {
              slug: "evasion-ranger-hunter-15-phb",
              active: true,
            },
          ],
        })),
      },
      monsterActionResolver: new MonsterActionResolver(),
      conditionLifecycle: {
        removeConditionsEndedByDamage: jest.fn(async () => []),
      },
      encounterEndDetector: {
        tryAutoEnd: jest.fn(async () => null),
      },
      resolveDamageAdjustments: jest.fn(
        async (_target: unknown, amount: number) => ({
          finalDamage: amount,
          resisted: false,
          immune: false,
          vulnerable: false,
        }),
      ),
    });

    const result = await combat.resolveAoeAction(encounter.id, {
      casterParticipantId: caster.id,
      actionName: "Acid Breath",
      affectedParticipantIds: [ranger.id],
      ownerUserId: "dm-user",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.results).toEqual([
      expect.objectContaining({
        participantId: ranger.id,
        damageRoll: expect.objectContaining({ finalDamage: 0 }),
        targetHpAfter: 169,
        targetDefeated: false,
      }),
    ]);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "class_feature_triggered",
        target_participant_id: ranger.id,
        data: expect.objectContaining({
          featureSlug: "evasion",
          damageAfterEvasion: 0,
        }),
      }),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "aoe_target_hit",
        target_participant_id: ranger.id,
        data: expect.objectContaining({
          damage: expect.objectContaining({ finalDamage: 0 }),
          targetHpAfter: 169,
        }),
      }),
    );
    expect(stateService.getCurrentHp).toHaveBeenCalledWith(ranger.characterId);
    expect(stateService.updateHp).not.toHaveBeenCalled();
  });
});
