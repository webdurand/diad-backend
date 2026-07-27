import { GameEngineController } from "../game-engine.controller";

const RELENTLESS_OPPORTUNITY_EVENT = {
  event_type: "relentless_endurance_opportunity",
  target_participant_id: "orc-1",
  data: { triggerEventId: "trigger-1" },
};

function makeHarness() {
  const realtime = {
    emitToRoom: jest.fn(),
  };
  const permissionResolver = {
    resolveMutationOwner: jest.fn().mockResolvedValue("owner-1"),
  };
  const combatService = {
    translateSlugToActionName: jest.fn().mockResolvedValue({
      ok: true,
      value: "Greataxe",
      events: [],
    }),
    resolveAttack: jest.fn(),
    resolveMultiattack: jest.fn(),
    applyDamage: jest.fn(),
  };
  const classFeatureExecutor = {
    execute: jest.fn(),
  };
  const controller = Object.create(
    GameEngineController.prototype,
  ) as GameEngineController;
  Object.assign(controller, {
    realtime,
    permissionResolver,
    combatService,
    classFeatureExecutor,
  });

  return {
    controller,
    realtime,
    combatService,
    classFeatureExecutor,
  };
}

function successfulResult(events = [RELENTLESS_OPPORTUNITY_EVENT]) {
  return {
    ok: true as const,
    value: {},
    events,
  };
}

function expectRelentlessInvalidate(realtime: { emitToRoom: jest.Mock }): void {
  expect(realtime.emitToRoom).toHaveBeenCalledTimes(1);
  expect(realtime.emitToRoom).toHaveBeenCalledWith(
    "encounter:enc-1",
    "encounter:invalidate",
    expect.objectContaining({
      encounterId: "enc-1",
      reason: "relentless-endurance-opportunity",
      at: expect.any(String),
    }),
  );
}

describe("GameEngineController — Relentless Endurance realtime", () => {
  const request = { user: { id: "user-1", email: "user@example.com" } };

  it("invalidates the encounter room when an attack creates the opportunity", async () => {
    const { controller, realtime, combatService } = makeHarness();
    combatService.resolveAttack.mockResolvedValue(successfulResult());

    await controller.resolveAttack(request as never, "enc-1", {
      attackerParticipantId: "attacker-1",
      targetParticipantId: "orc-1",
      actionSlug: "greataxe",
    });

    expectRelentlessInvalidate(realtime);
  });

  it("invalidates the encounter room when a multiattack creates the opportunity", async () => {
    const { controller, realtime, combatService } = makeHarness();
    combatService.translateSlugToActionName.mockResolvedValue({
      ok: true,
      value: "Multiattack",
      events: [],
    });
    combatService.resolveMultiattack.mockResolvedValue(successfulResult());

    await controller.resolveAttack(request as never, "enc-1", {
      attackerParticipantId: "attacker-1",
      targetParticipantId: "orc-1",
      actionSlug: "multiattack",
    });

    expectRelentlessInvalidate(realtime);
  });

  it("invalidates the encounter room when direct damage creates the opportunity", async () => {
    const { controller, realtime, combatService } = makeHarness();
    combatService.applyDamage.mockResolvedValue(successfulResult());

    await controller.applyDamage(request as never, "enc-1", {
      targetParticipantId: "orc-1",
      amount: 12,
      damageType: "slashing",
    });

    expectRelentlessInvalidate(realtime);
  });

  it("invalidates the encounter room when a class feature creates the opportunity", async () => {
    const { controller, realtime, classFeatureExecutor } = makeHarness();
    classFeatureExecutor.execute.mockResolvedValue(successfulResult());

    await controller.invokeClassFeature(request as never, "enc-1", {
      participantId: "attacker-1",
      featureSlug: "damaging-feature",
    });

    expectRelentlessInvalidate(realtime);
  });

  it("does not invalidate for a successful attack without the opportunity event", async () => {
    const { controller, realtime, combatService } = makeHarness();
    combatService.resolveAttack.mockResolvedValue(
      successfulResult([
        {
          event_type: "damage_applied",
          target_participant_id: "orc-1",
          data: { damage: 3 },
        },
      ]),
    );

    await controller.resolveAttack(request as never, "enc-1", {
      attackerParticipantId: "attacker-1",
      targetParticipantId: "orc-1",
      actionSlug: "greataxe",
    });

    expect(realtime.emitToRoom).not.toHaveBeenCalled();
  });
});
