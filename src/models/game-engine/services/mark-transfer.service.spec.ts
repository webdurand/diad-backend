/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenException } from "@nestjs/common";
import { MarkTransferService } from "./mark-transfer.service";

function createHarness(
  overrides: {
    caster?: Record<string, unknown>;
    previousTarget?: Record<string, unknown>;
    newTarget?: Record<string, unknown>;
    encounter?: Record<string, unknown> | null;
    permissionError?: Error;
  } = {},
) {
  const mark = {
    id: "mark-1",
    kind: "hunter_mark",
    sourceSpellSlug: "hunters-mark",
    sourceCasterParticipantId: "ranger-1",
    payload: {
      riderDice: "1d6",
      transferReadyTurnKey: "1:0",
      transferReadyRound: 1,
      transferReadyTurnIndex: 0,
    },
    expiresAt: { kind: "concentration" },
    requiresConcentration: true,
    appliedAt: "2026-07-27T00:00:00.000Z",
  };
  const caster = {
    id: "ranger-1",
    encounterId: "encounter-1",
    displayName: "Arannis",
    isConcentrating: true,
    concentratingOn: "hunters-mark-phb",
    concentrationRoundsRemaining: 600,
    bonusActionUsed: false,
    positionX: 2,
    positionY: 2,
    ...overrides.caster,
  };
  const previousTarget = {
    id: "target-down",
    encounterId: "encounter-1",
    displayName: "Alvo derrotado",
    currentHp: 0,
    isDefeated: true,
    dyingState: "none",
    effectInstances: [mark],
    ...overrides.previousTarget,
  };
  const newTarget = {
    id: "target-new",
    encounterId: "encounter-1",
    displayName: "Novo alvo",
    currentHp: 12,
    isDefeated: false,
    dyingState: "none",
    isVisible: true,
    conditions: [],
    positionX: 10,
    positionY: 2,
    effectInstances: [],
    ...overrides.newTarget,
  };
  const encounter =
    overrides.encounter === null
      ? null
      : {
          id: "encounter-1",
          status: "active",
          currentRound: 2,
          currentTurnIndex: 0,
          turnOrder: ["ranger-1", "target-new"],
          ...overrides.encounter,
        };
  const participants = {
    findOne: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === caster.id ? caster : null),
    ),
    find: jest.fn().mockResolvedValue([caster, previousTarget, newTarget]),
    save: jest.fn((participant: unknown) => Promise.resolve(participant)),
  };
  const encounters = {
    findOne: jest.fn().mockResolvedValue(encounter),
  };
  const effects = {
    removeEffect: jest.fn().mockResolvedValue({
      removed: true,
      events: [
        {
          event_type: "effect_expired",
          target_participant_id: previousTarget.id,
          data: { effectId: mark.id, reason: "manual" },
        },
      ],
    }),
    addEffect: jest.fn((_target: unknown, input: Record<string, unknown>) =>
      Promise.resolve({
        applied: true,
        effect: { ...input, id: "mark-2" },
        events: [
          {
            event_type: "effect_applied",
            target_participant_id: newTarget.id,
            data: { effectId: "mark-2" },
          },
        ],
      }),
    ),
  };
  const permissionResolver = {
    resolveMutationOwner: overrides.permissionError
      ? jest.fn().mockRejectedValue(overrides.permissionError)
      : jest.fn().mockResolvedValue("owner-1"),
  };
  const service = new MarkTransferService(
    participants as any,
    encounters as any,
    effects as any,
    permissionResolver as any,
  );

  return {
    service,
    caster,
    previousTarget,
    newTarget,
    encounter,
    participants,
    encounters,
    effects,
    permissionResolver,
  };
}

const dto = {
  encounterId: "encounter-1",
  casterParticipantId: "ranger-1",
  newTargetParticipantId: "target-new",
  sourceSpellSlug: "hunters-mark" as const,
  ownerUserId: "owner-1",
};

describe("MarkTransferService", () => {
  it("transfere a marca como ação bônus sem slot e preserva concentração/duração", async () => {
    const harness = createHarness();

    const result = await harness.service.transferMark(dto);

    expect(result.ok).toBe(true);
    expect(
      harness.permissionResolver.resolveMutationOwner,
    ).toHaveBeenCalledWith("ranger-1", "owner-1", "encounter-1");
    expect(harness.effects.removeEffect).toHaveBeenCalledWith(
      harness.previousTarget,
      "mark-1",
      "manual",
    );
    expect(harness.effects.addEffect).toHaveBeenCalledWith(
      harness.newTarget,
      expect.objectContaining({
        kind: "hunter_mark",
        sourceSpellSlug: "hunters-mark",
        sourceCasterParticipantId: "ranger-1",
        payload: { riderDice: "1d6" },
        expiresAt: { kind: "concentration" },
        requiresConcentration: true,
      }),
    );
    expect(harness.caster.bonusActionUsed).toBe(true);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "mark_transferred",
          data: expect.objectContaining({
            fromTargetName: "Alvo derrotado",
            toTargetName: "Novo alvo",
            distanceFt: 40,
            rangeFt: 90,
            bonusActionConsumed: true,
            spellSlotConsumed: false,
            concentrationPreserved: true,
            concentrationRoundsRemaining: 600,
          }),
        }),
      ]),
    );
  });

  it("propaga a recusa de autorização antes de ler ou alterar o encontro", async () => {
    const harness = createHarness({
      permissionError: new ForbiddenException(
        "Voce nao controla este personagem.",
      ),
    });

    await expect(harness.service.transferMark(dto)).rejects.toThrow(
      "Voce nao controla este personagem.",
    );
    expect(harness.encounters.findOne).not.toHaveBeenCalled();
    expect(harness.effects.removeEffect).not.toHaveBeenCalled();
  });

  it("rejeita alvo além de 90 pés sem consumir a ação bônus", async () => {
    const harness = createHarness({
      newTarget: { positionX: 21, positionY: 2 },
    });

    const result = await harness.service.transferMark(dto);

    expect(result).toMatchObject({
      ok: false,
      code: "TARGET_OUT_OF_RANGE",
    });
    expect(harness.caster.bonusActionUsed).toBe(false);
    expect(harness.effects.removeEffect).not.toHaveBeenCalled();
  });

  it.each([
    [
      "BONUS_ACTION_UNAVAILABLE",
      {
        caster: { bonusActionUsed: true },
        previousTarget: { currentHp: 12, isDefeated: false },
      },
    ],
    [
      "PREVIOUS_TARGET_STILL_ACTIVE",
      { previousTarget: { currentHp: 1, isDefeated: false } },
    ],
    ["TARGET_NOT_VISIBLE", { newTarget: { isVisible: false } }],
    [
      "NOT_CASTER_TURN",
      { encounter: { turnOrder: ["target-new", "ranger-1"] } },
    ],
    [
      "MARK_CONCENTRATION_ENDED",
      { caster: { isConcentrating: false, concentratingOn: null } },
    ],
  ])("rejeita estado inválido com %s", async (code, options) => {
    const harness = createHarness(options);

    await expect(harness.service.transferMark(dto)).resolves.toMatchObject({
      ok: false,
      code,
    });
    expect(harness.effects.removeEffect).not.toHaveBeenCalled();
  });

  it("impede a transferência no mesmo turno em que o alvo caiu", async () => {
    const harness = createHarness({
      encounter: { currentRound: 1, currentTurnIndex: 0 },
    });

    await expect(harness.service.transferMark(dto)).resolves.toMatchObject({
      ok: false,
      code: "TRANSFER_NOT_YET_AVAILABLE",
    });
    expect(harness.effects.removeEffect).not.toHaveBeenCalled();
  });
});
