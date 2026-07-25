import { EffectInstanceService } from "./effect-instance.service";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";

function participant(
  overrides: Partial<EncounterParticipantEntity> = {},
): EncounterParticipantEntity {
  return {
    id: "target",
    encounterId: "encounter",
    type: "npc",
    displayName: "Alvo",
    currentHp: 10,
    maxHp: 20,
    effectInstances: [],
    appliedEffects: [],
    ...overrides,
  } as EncounterParticipantEntity;
}

describe("EffectInstanceService — bônus temporário de PV máximo", () => {
  it("aumenta PV atuais/máximos e desfaz ambos ao expirar", async () => {
    const repository = {
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    const characterState = {
      adjustTemporaryHitPointMaximum: jest.fn(),
    };
    const service = new EffectInstanceService(
      repository as never,
      characterState as never,
    );
    const target = participant();

    const applied = await service.addEffect(target, {
      kind: "hit_point_maximum_bonus",
      sourceSpellSlug: "aid",
      sourceCasterParticipantId: "caster",
      payload: { amount: 5, slotLevel: 2 },
      expiresAt: { kind: "rounds", value: 1 },
      requiresConcentration: false,
    });

    expect(target.currentHp).toBe(15);
    expect(target.maxHp).toBe(25);
    expect(applied.effect.payload).toMatchObject({
      hpBefore: 10,
      hpAfter: 15,
      maxHpBefore: 20,
      maxHpAfter: 25,
    });

    const expired = await service.tickAtEndOfTurn(target);
    expect(target.currentHp).toBe(10);
    expect(target.maxHp).toBe(20);
    expect(target.effectInstances).toEqual([]);
    expect(expired.events[0]).toMatchObject({
      event_type: "effect_expired",
      data: {
        kind: "hit_point_maximum_bonus",
        hpBefore: 15,
        hpAfter: 10,
        maxHpBefore: 25,
        maxHpAfter: 20,
      },
    });
  });

  it("sincroniza personagens com o estado canônico da ficha", async () => {
    const repository = {
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    const characterState = {
      adjustTemporaryHitPointMaximum: jest.fn().mockResolvedValue({
        currentHpBefore: 39,
        currentHpAfter: 49,
        maxHpBefore: 124,
        maxHpAfter: 134,
      }),
    };
    const service = new EffectInstanceService(
      repository as never,
      characterState as never,
    );
    const target = participant({
      type: "pc",
      characterId: "character",
      currentHp: 39,
      maxHp: 124,
    });

    await service.addEffect(target, {
      kind: "hit_point_maximum_bonus",
      sourceSpellSlug: "aid",
      sourceCasterParticipantId: "caster",
      payload: { amount: 10, slotLevel: 3 },
      expiresAt: { kind: "rounds", value: 4_800 },
      requiresConcentration: false,
    });

    expect(
      characterState.adjustTemporaryHitPointMaximum,
    ).toHaveBeenCalledWith("character", 10);
    expect(target.currentHp).toBe(49);
    expect(target.maxHp).toBe(134);
  });
});
