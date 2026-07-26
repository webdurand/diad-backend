import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type {
  ConditionInstance,
  EffectInstance,
} from "../interfaces/combat.interfaces";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { EffectInstanceService } from "./effect-instance.service";
import {
  FREEDOM_OF_MOVEMENT_DURATION_ROUNDS,
  hasFreedomOfMovement,
  isMagicalMobilityCondition,
  isNonmagicalFreedomRestraint,
} from "./freedom-of-movement";
import { GenericActionsService } from "./generic-actions.service";
import {
  applyEffectSpeedModifiers,
  canIgnoreDifficultTerrain,
  getFreedomSwimSpeed,
} from "./movement.service";
import { materializeSpellEffects } from "./spell-effect-catalog";
import { maxTargetsFor } from "./spell-targeting";

function freedomEffect(overrides: Partial<EffectInstance> = {}): EffectInstance {
  return {
    id: "freedom",
    kind: "freedom_of_movement",
    sourceSpellSlug: "freedom-of-movement",
    sourceCasterParticipantId: "caster",
    payload: { equalsWalkingSpeed: true },
    expiresAt: {
      kind: "rounds",
      value: FREEDOM_OF_MOVEMENT_DURATION_ROUNDS,
    },
    requiresConcentration: false,
    appliedAt: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

function participant(
  overrides: Partial<EncounterParticipantEntity> = {},
): EncounterParticipantEntity {
  return {
    id: "target",
    encounterId: "encounter",
    displayName: "Alvo disposto",
    type: "npc",
    faction: "ally",
    conditions: [],
    conditionInstances: [],
    effectInstances: [],
    appliedEffects: [],
    movementRemaining: 30,
    actionUsed: false,
    bonusActionUsed: false,
    reactionsUsed: 0,
    dyingState: "none",
    isDefeated: false,
    monster: { speed: { walk: 30 } },
    ...overrides,
  } as unknown as EncounterParticipantEntity;
}

describe("Freedom of Movement — SRD 5.2", () => {
  it("materializa 1h sem concentração e adiciona um alvo por upcast", () => {
    const spell = {
      slug: "freedom-of-movement",
      area_of_effect: null,
    } as never;
    expect(maxTargetsFor(spell, 4, 15)).toBe(1);
    expect(maxTargetsFor(spell, 6, 15)).toBe(3);

    const effects = materializeSpellEffects("freedom-of-movement-xphb", {
      casterParticipantId: "caster",
      targetParticipantIds: ["ally-1", "ally-2", "ally-3", "ally-4"],
      slotLevel: 6,
    });

    expect(effects).toHaveLength(3);
    expect(effects.map((effect) => effect.targetParticipantId)).toEqual([
      "ally-1",
      "ally-2",
      "ally-3",
    ]);
    expect(effects[0].input).toEqual(
      expect.objectContaining({
        kind: "freedom_of_movement",
        sourceSpellSlug: "freedom-of-movement",
        expiresAt: { kind: "rounds", value: 600 },
        requiresConcentration: false,
      }),
    );
  });

  it("persiste o efeito serializado e expira ao fim da duração", async () => {
    const repo = {
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
    };
    const service = new EffectInstanceService(
      repo as never,
      {} as never,
    );
    const target = participant();
    const applied = await service.addEffect(target, {
      kind: "freedom_of_movement",
      sourceSpellSlug: "freedom-of-movement",
      sourceCasterParticipantId: "caster",
      payload: { equalsWalkingSpeed: true },
      expiresAt: { kind: "rounds", value: 600 },
      requiresConcentration: false,
    });

    expect(applied.applied).toBe(true);
    const reloaded = JSON.parse(
      JSON.stringify(target),
    ) as EncounterParticipantEntity;
    expect(hasFreedomOfMovement(reloaded)).toBe(true);
    reloaded.effectInstances[0].expiresAt.value = 1;

    const expired = await service.tickAtEndOfTurn(reloaded);
    expect(expired.expired).toEqual([applied.effect.id]);
    expect(reloaded.effectInstances).toEqual([]);
    expect(expired.events[0]).toEqual(
      expect.objectContaining({
        event_type: "effect_expired",
        data: expect.objectContaining({
          sourceSpellSlug: "freedom-of-movement",
          reason: "duration",
        }),
      }),
    );
  });

  it("ignora redução mágica de Speed, mas preserva redução não mágica", () => {
    const magicalReduction = {
      id: "ray",
      kind: "speed_reduction",
      sourceSpellSlug: "ray-of-frost",
      sourceCasterParticipantId: "enemy",
      payload: { amount: 10 },
      expiresAt: { kind: "rounds", value: 1 },
      requiresConcentration: false,
      appliedAt: "now",
    } as EffectInstance;
    const nonmagicalReduction = {
      ...magicalReduction,
      id: "weapon",
      sourceSpellSlug: undefined,
      sourceFeatureSlug: "frosts-chill",
    };

    expect(
      applyEffectSpeedModifiers(30, [
        freedomEffect(),
        magicalReduction,
        nonmagicalReduction,
      ]),
    ).toBe(20);
    expect(applyEffectSpeedModifiers(30, [magicalReduction])).toBe(20);
  });

  it("ignora terreno difícil e concede Swim Speed igual à Speed", () => {
    const target = participant({ effectInstances: [freedomEffect()] });
    expect(canIgnoreDifficultTerrain(target, false)).toBe(true);
    expect(getFreedomSwimSpeed(40, target)).toBe(40);
    expect(
      canIgnoreDifficultTerrain(
        participant({ effectInstances: [] }),
        false,
      ),
    ).toBe(false);
  });

  it("bloqueia novas reduções mágicas de Speed com feedback", async () => {
    const repo = {
      save: jest.fn(),
      findOne: jest.fn(),
    };
    const service = new EffectInstanceService(
      repo as never,
      {} as never,
    );
    const target = participant({ effectInstances: [freedomEffect()] });

    const result = await service.addEffect(target, {
      kind: "speed_reduction",
      sourceSpellSlug: "ray-of-frost",
      sourceCasterParticipantId: "enemy",
      payload: { amount: 10 },
      expiresAt: { kind: "rounds", value: 1 },
      requiresConcentration: false,
    });

    expect(result.applied).toBe(false);
    expect(repo.save).not.toHaveBeenCalled();
    expect(target.effectInstances).toHaveLength(1);
    expect(result.events[0].event_type).toBe(
      "effect_blocked_by_freedom_of_movement",
    );
  });

  it("bloqueia Paralyzed/Restrained mágicos e aceita restrição não mágica", async () => {
    const repo = {
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
    };
    const concentration = {
      checkBreakOnCondition: jest.fn(async () => ({
        broken: false,
        events: [],
      })),
      trackAppliedEffect: jest.fn(),
    };
    const service = new ConditionLifecycleService(
      repo as never,
      { find: jest.fn(async () => []) } as never,
      concentration as never,
      {} as never,
    );
    const target = participant({ effectInstances: [freedomEffect()] });

    const blocked = await service.applyCondition(target, {
      slug: "paralyzed",
      sourceSpell: "hold-person",
      appliedBy: "enemy",
    });
    expect(blocked.events[0]).toEqual(
      expect.objectContaining({
        event_type: "condition_blocked_by_immunity",
        data: expect.objectContaining({ source: "freedom-of-movement" }),
      }),
    );
    expect(target.conditions).toEqual([]);

    const applied = await service.applyCondition(target, {
      slug: "restrained",
      source: "ability:monster-web",
      appliedBy: "enemy",
    });
    expect(applied.instance.slug).toBe("restrained");
    expect(target.conditions).toContain("restrained");
    expect(isMagicalMobilityCondition(applied.instance)).toBe(false);
    expect(isNonmagicalFreedomRestraint(applied.instance)).toBe(true);
  });

  it("gasta 5ft e escapa automaticamente sem consumir ação", async () => {
    const restraint: ConditionInstance = {
      id: "grapple",
      slug: "grappled",
      appliedBy: "enemy",
      sourceSpell: null,
      sourceConcentration: false,
      source: "ability:monster-grapple",
      saveAbility: null,
      saveDc: null,
      repeatSaveTiming: "never",
      durationRoundsRemaining: null,
      expiresAtTurnEndParticipantId: null,
      appliedAt: "now",
    };
    const target = participant({
      conditions: ["grappled"],
      conditionInstances: [restraint],
      grappledByParticipantId: "enemy",
      movementRemaining: 20,
      effectInstances: [freedomEffect()],
    });
    const repo = { save: jest.fn(async (value) => value) };
    const lifecycle = {
      removeConditionInstance: jest.fn(
        async (value: EncounterParticipantEntity, id: string) => {
          value.conditionInstances = value.conditionInstances.filter(
            (condition) => condition.id !== id,
          );
          value.conditions = value.conditionInstances.map(
            (condition) => condition.slug,
          );
          value.grappledByParticipantId = null;
          return {
            removed: true,
            events: [{ event_type: "condition_removed", data: {} }],
          };
        },
      ),
    };
    const service = new GenericActionsService(
      {} as never,
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      lifecycle as never,
    );

    const result = await (
      service as unknown as {
        handleFreedomEscape(
          value: EncounterParticipantEntity,
        ): Promise<{
          ok: boolean;
          value: { step: { result: { summary: string } } };
          events: Array<{ event_type: string }>;
        }>;
      }
    ).handleFreedomEscape(target);

    expect(result.ok).toBe(true);
    expect(target.movementRemaining).toBe(15);
    expect(target.actionUsed).toBe(false);
    expect(target.conditions).toEqual([]);
    expect(target.grappledByParticipantId).toBeNull();
    expect(result.events.at(-1)?.event_type).toBe(
      "freedom_of_movement_escape",
    );
    expect(result.value.step.result.summary).toContain("gastou 5ft");
    expect(result.value.step.result.summary).toContain("Agarrado");
    expect(result.value.step.result.summary).not.toContain("grappled");
  });
});
