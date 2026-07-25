import type { EncounterEntity } from "src/entities/encounter.entity";
import type { GameEventData } from "../interfaces/result.type";
import { AiTurnService } from "./ai-turn.service";

describe("AiTurnService persistent area movement", () => {
  it("coalesces concurrent requests for the same AI turn", async () => {
    const service = new AiTurnService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { setContext: jest.fn() } as never,
    );
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const internal = jest
      .spyOn(
        service as unknown as {
          executeAiTurnInternal: (
            encounterId: string,
            participantId: string,
            authUserId: string,
          ) => Promise<unknown>;
        },
        "executeAiTurnInternal",
      )
      .mockReturnValue(pending);

    const first = service.executeAiTurn("enc-1", "monster-1", "user-1");
    const second = service.executeAiTurn("enc-1", "monster-1", "user-1");

    expect(internal).toHaveBeenCalledTimes(1);
    release({ ok: true, value: { steps: [] }, events: [] });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    await service.executeAiTurn("enc-1", "monster-1", "user-1");
    expect(internal).toHaveBeenCalledTimes(2);
  });

  it("stands up before planning an AI turn when movement is available", async () => {
    const encounter = {
      id: "encounter-1",
      sessionId: "session-1",
      status: "active",
      currentRound: 2,
      currentTurnIndex: 0,
      turnOrder: ["monster-1", "pc-1"],
    } as EncounterEntity;
    const participant = {
      id: "monster-1",
      controlledBy: "ai",
      conditions: ["prone"],
      conditionInstances: [{ id: "condition-prone", slug: "prone" }],
      actionUsed: false,
      bonusActionUsed: false,
      movementRemaining: 40,
      reactionsUsed: 0,
      currentHp: 20,
      maxHp: 20,
      dyingState: "none",
    };
    const encounterRepo = {
      findOne: jest.fn().mockResolvedValue(encounter),
    };
    const participantRepo = {
      findOne: jest.fn().mockResolvedValue(participant),
      save: jest.fn(async (value: unknown) => value),
    };
    const executor = {
      executeTurn: jest.fn().mockResolvedValue({
        ok: true,
        value: { steps: [{ kind: "end-turn" }], rationale: "test" },
      }),
    };
    const snapshotService = {
      build: jest.fn().mockResolvedValue({
        ok: true,
        value: {
          participants: [
            {
              id: "monster-1",
              displayName: "Ogre",
              faction: "enemy",
              dyingState: "none",
              hp: { current: 20, max: 20 },
              position: { x: 10, y: 10 },
              statblockRef: { actions: [] },
            },
            {
              id: "pc-1",
              displayName: "Monk",
              faction: "party",
              dyingState: "none",
              hp: { current: 30, max: 30 },
              position: { x: 10, y: 11 },
            },
          ],
        },
      }),
    };
    const combatService = {
      endTurn: jest.fn().mockResolvedValue({ ok: true, value: {} }),
    };
    const stoodUpEvents: GameEventData[] = [
      {
        event_type: "stood_up",
        actor_participant_id: "monster-1",
        data: { movementSpent: 20, remainingMovement: 20 },
      },
    ];
    const movementService = {
      standUp: jest.fn().mockImplementation(async () => {
        participant.conditions = [];
        participant.conditionInstances = [];
        participant.movementRemaining = 20;
        return {
          ok: true,
          value: {
            participantId: "monster-1",
            movementSpent: 20,
            remainingMovement: 20,
          },
          events: stoodUpEvents,
        };
      }),
    };
    const eventService = { emit: jest.fn().mockResolvedValue([]) };
    const logger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };
    const service = new AiTurnService(
      encounterRepo as never,
      participantRepo as never,
      executor as never,
      snapshotService as never,
      combatService as never,
      {} as never,
      movementService as never,
      {} as never,
      {} as never,
      eventService as never,
      logger as never,
    );

    const result = await service.executeAiTurn(
      encounter.id,
      participant.id,
      "user-1",
    );

    expect(result.ok).toBe(true);
    expect(movementService.standUp).toHaveBeenCalledWith(
      encounter.id,
      participant.id,
      "user-1",
    );
    expect(
      movementService.standUp.mock.invocationCallOrder[0],
    ).toBeLessThan(snapshotService.build.mock.invocationCallOrder[0]);
    expect(eventService.emit).toHaveBeenCalledWith(
      encounter.sessionId,
      encounter.id,
      stoodUpEvents,
    );
    expect(
      result.ok ? result.value.steps[0] : undefined,
    ).toMatchObject({
      kind: "stand-up",
      result: { ok: true, summary: "Levantou-se (20ft de movimento)" },
    });
  });

  it("applies and records persistent-area damage produced by AI movement", async () => {
    const movementEvents: GameEventData[] = [
      {
        event_type: "movement",
        actor_participant_id: "monster-1",
        data: { toX: 4, toY: 5 },
      },
      {
        event_type: "tile_effect_save_rolled",
        target_participant_id: "monster-1",
        data: { ability: "dex", dc: 19, total: 12, passed: false },
      },
      {
        event_type: "tile_effect_damage_applied",
        target_participant_id: "monster-1",
        data: {
          effectKind: "conjure-animals",
          expression: "9d10",
          type: "slashing",
          amount: 47,
        },
      },
    ];
    const hpEvent: GameEventData = {
      event_type: "damage_applied",
      target_participant_id: "monster-1",
      data: { amount: 47, hpAfter: 35 },
    };
    const movementService = {
      moveParticipant: jest.fn().mockResolvedValue({
        ok: true,
        value: {
          participantId: "monster-1",
          fromX: 1,
          fromY: 1,
          toX: 4,
          toY: 5,
        },
        events: movementEvents,
      }),
    };
    const combatService = {
      applyPersistentAreaDamageEvents: jest
        .fn()
        .mockResolvedValue([hpEvent]),
    };
    const eventService = { emit: jest.fn().mockResolvedValue([]) };
    const service = new AiTurnService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      combatService as never,
      {} as never,
      movementService as never,
      {} as never,
      {} as never,
      eventService as never,
      { setContext: jest.fn() } as never,
    );
    const encounter = {
      id: "encounter-1",
      sessionId: "session-1",
    } as EncounterEntity;

    const result = await (
      service as unknown as {
        applyStep: (
          encounter: EncounterEntity,
          participantId: string,
          step: { kind: "move"; to: { x: number; y: number } },
          authUserId: string,
        ) => Promise<{
          result: {
            events: Array<{
              type: string;
              expression?: string;
              targetParticipantId?: string;
            }>;
          };
        }>;
      }
    ).applyStep(
      encounter,
      "monster-1",
      { kind: "move", to: { x: 4, y: 5 } },
      "user-1",
    );

    expect(
      combatService.applyPersistentAreaDamageEvents,
    ).toHaveBeenCalledWith(
      "encounter-1",
      expect.arrayContaining(movementEvents),
      "user-1",
    );
    expect(eventService.emit).toHaveBeenCalledWith(
      "session-1",
      "encounter-1",
      [...movementEvents, hpEvent],
    );
    expect(result.result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tile_effect_damage_applied",
          targetParticipantId: "monster-1",
          expression: "9d10",
        }),
        expect.objectContaining({
          type: "damage_applied",
          targetParticipantId: "monster-1",
        }),
      ]),
    );
  });

  it("resolves a prepared attack automatically when AI movement enters range", async () => {
    const movementEvents: GameEventData[] = [
      {
        event_type: "movement",
        actor_participant_id: "monster-1",
        data: { toX: 4, toY: 5 },
      },
      {
        event_type: "ready_action_available",
        actor_participant_id: "pc-1",
        target_participant_id: "monster-1",
        data: { actionName: "Sickle" },
      },
    ];
    const readyResolvedEvent: GameEventData = {
      event_type: "ready_action_resolved",
      actor_participant_id: "pc-1",
      target_participant_id: "monster-1",
      data: {
        actionName: "Sickle",
        triggerKind: "enemy_enters_range",
        reactionConsumed: true,
      },
    };
    const movementService = {
      moveParticipant: jest.fn().mockResolvedValue({
        ok: true,
        value: {
          participantId: "monster-1",
          fromX: 1,
          fromY: 1,
          toX: 4,
          toY: 5,
          readyActions: [
            {
              reactorParticipantId: "pc-1",
              reactorName: "Druid",
              actionName: "Sickle",
            },
          ],
        },
        events: movementEvents,
      }),
    };
    const readyActionService = {
      resolve: jest.fn().mockResolvedValue({
        ok: true,
        value: {},
        events: [readyResolvedEvent],
      }),
    };
    const combatService = {
      applyPersistentAreaDamageEvents: jest.fn().mockResolvedValue([]),
    };
    const eventService = { emit: jest.fn().mockResolvedValue([]) };
    const service = new AiTurnService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      combatService as never,
      {} as never,
      movementService as never,
      {} as never,
      readyActionService as never,
      eventService as never,
      { setContext: jest.fn() } as never,
    );
    const encounter = {
      id: "encounter-1",
      sessionId: "session-1",
    } as EncounterEntity;

    const result = await (
      service as unknown as {
        applyStep: (
          encounter: EncounterEntity,
          participantId: string,
          step: { kind: "move"; to: { x: number; y: number } },
          authUserId: string,
        ) => Promise<{ result: { events: Array<{ type: string }> } }>;
      }
    ).applyStep(
      encounter,
      "monster-1",
      { kind: "move", to: { x: 4, y: 5 } },
      "user-1",
    );

    expect(readyActionService.resolve).toHaveBeenCalledWith({
      encounterId: "encounter-1",
      reactorParticipantId: "pc-1",
      targetParticipantId: "monster-1",
      ownerUserId: "user-1",
      expectedTriggerKind: "enemy_enters_range",
    });
    expect(eventService.emit).toHaveBeenCalledWith(
      "session-1",
      "encounter-1",
      [...movementEvents, readyResolvedEvent],
    );
    expect(result.result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "ready_action_resolved" }),
      ]),
    );
  });

  it("resolves a prepared reaction after the AI attacks the protected ally", async () => {
    const combatService = {
      resolveAttack: jest.fn().mockResolvedValue({
        ok: true,
        value: {
          attackRoll: { hit: true, critical: false },
          damageRoll: { finalDamage: 8, type: "slashing" },
          targetDefeated: false,
          targetHpBefore: 30,
          targetHpAfter: 22,
        },
        events: [],
      }),
    };
    const participantRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: "ally-1",
          encounterId: "encounter-1",
          faction: "party",
          isDefeated: false,
          readiedAction: null,
        },
        {
          id: "reactor-1",
          encounterId: "encounter-1",
          faction: "party",
          isDefeated: false,
          readiedAction: {
            trigger: {
              kind: "enemy_attacks_ally",
              allyParticipantId: "ally-1",
            },
            actionDescriptor: { kind: "attack", actionName: "Sickle" },
          },
        },
      ]),
    };
    const readyResolvedEvent: GameEventData = {
      event_type: "ready_action_resolved",
      actor_participant_id: "reactor-1",
      target_participant_id: "monster-1",
      data: {
        actionName: "Sickle",
        triggerKind: "enemy_attacks_ally",
        reactionConsumed: true,
      },
    };
    const readyActionService = {
      resolve: jest.fn().mockResolvedValue({
        ok: true,
        value: {},
        events: [readyResolvedEvent],
      }),
    };
    const eventService = { emit: jest.fn().mockResolvedValue([]) };
    const service = new AiTurnService(
      {} as never,
      participantRepo as never,
      {} as never,
      {} as never,
      combatService as never,
      {} as never,
      {} as never,
      {} as never,
      readyActionService as never,
      eventService as never,
      { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() } as never,
    );
    const encounter = {
      id: "encounter-1",
      sessionId: "session-1",
    } as EncounterEntity;

    const result = await (
      service as unknown as {
        applyStep: (
          encounter: EncounterEntity,
          participantId: string,
          step: {
            kind: "attack";
            actionName: string;
            targetParticipantIds: string[];
          },
          authUserId: string,
        ) => Promise<{ result: { events: Array<{ type: string }> } }>;
      }
    ).applyStep(
      encounter,
      "monster-1",
      {
        kind: "attack",
        actionName: "Claw",
        targetParticipantIds: ["ally-1"],
      },
      "user-1",
    );

    expect(readyActionService.resolve).toHaveBeenCalledWith({
      encounterId: "encounter-1",
      reactorParticipantId: "reactor-1",
      targetParticipantId: "monster-1",
      ownerUserId: "user-1",
      expectedTriggerKind: "enemy_attacks_ally",
    });
    expect(eventService.emit).toHaveBeenCalledWith(
      "session-1",
      "encounter-1",
      [readyResolvedEvent],
    );
    expect(result.result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "ready_action_resolved" }),
      ]),
    );
  });

  it("does not persist attack events twice after CombatService already recorded them", async () => {
    const combatService = {
      resolveAttack: jest.fn().mockResolvedValue({
        ok: true,
        value: {
          attackRoll: { hit: true, critical: false },
          damageRoll: { finalDamage: 6, type: "slashing" },
          targetDefeated: true,
          targetHpAfter: 0,
        },
        events: [
          {
            event_type: "attack_roll",
            actor_participant_id: "monster-1",
            target_participant_id: "summon-1",
          },
          {
            event_type: "damage_applied",
            actor_participant_id: "monster-1",
            target_participant_id: "summon-1",
          },
          {
            event_type: "summon_dismissed",
            actor_participant_id: "caster-1",
            target_participant_id: "summon-1",
          },
        ],
      }),
    };
    const eventService = { emit: jest.fn().mockResolvedValue([]) };
    const service = new AiTurnService(
      {} as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      combatService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      eventService as never,
      { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() } as never,
    );
    const encounter = {
      id: "encounter-1",
      sessionId: "session-1",
    } as EncounterEntity;

    const result = await (
      service as unknown as {
        applyStep: (
          encounter: EncounterEntity,
          participantId: string,
          step: {
            kind: "attack";
            actionName: string;
            targetParticipantIds: string[];
          },
          authUserId: string,
          isSubAttack: boolean,
        ) => Promise<{
          result: {
            events: Array<{
              type: string;
              targetDefeated?: boolean;
            }>;
          };
        }>;
      }
    ).applyStep(
      encounter,
      "monster-1",
      {
        kind: "attack",
        actionName: "Talon",
        targetParticipantIds: ["summon-1"],
      },
      "user-1",
      false,
    );

    expect(combatService.resolveAttack).toHaveBeenCalledTimes(1);
    expect(eventService.emit).not.toHaveBeenCalled();
    expect(result.result.events).toEqual([
      expect.objectContaining({
        type: "attack_resolved",
        targetDefeated: true,
      }),
    ]);
  });
});
