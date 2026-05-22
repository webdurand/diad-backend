import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { DialogueActionService } from "../dialogue-action.service";

function makeService(overrides: Record<string, any> = {}) {
  return new DialogueActionService(
    overrides.sceneService as any,
    (overrides.sceneNpcRepo ?? { findOne: jest.fn(), update: jest.fn() }) as any,
    (overrides.movementLockService ?? {
      getActiveForSession: jest.fn().mockResolvedValue({
        sceneId: "scene-1",
        movementLock: { interlocutorNpcId: "npc-1" },
      }),
      setForActiveScene: jest.fn(),
    }) as any,
    (overrides.eventBus ?? { publish: jest.fn() }) as any,
    (overrides.envelopeFactory ?? { build: jest.fn((value) => value) }) as any,
  );
}

describe("DialogueActionService skill roll cap", () => {
  it("persiste ate 2 skill rolls por turno de dialogo", async () => {
    const sceneService = {
      getActive: jest.fn().mockResolvedValue({
        id: "scene-1",
        sessionId: "session-1",
        contextSnapshot: { dialogueSkillRollCount: 1 },
      }),
      update: jest.fn().mockResolvedValue({}),
    };
    const service = makeService({ sceneService });

    const result = await service.registerSkillRoll("session-1", {
      actionId: "skill_persuasion",
    });

    expect(result).toEqual({ used: 2, remaining: 0 });
    expect(sceneService.update).toHaveBeenCalledWith("scene-1", {
      contextSnapshot: expect.objectContaining({ dialogueSkillRollCount: 2 }),
    });
  });

  it("bloqueia o terceiro roll com DIALOGUE_SKILL_ROLL_CAP_EXCEEDED", async () => {
    const service = makeService({
      sceneService: {
        getActive: jest.fn().mockResolvedValue({
          id: "scene-1",
          sessionId: "session-1",
          contextSnapshot: { dialogueSkillRollCount: 2 },
        }),
        update: jest.fn(),
      },
    });

    await expect(
      service.registerSkillRoll("session-1", { actionId: "skill_insight" }),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: ErrorCode.DIALOGUE_SKILL_ROLL_CAP_EXCEEDED,
    });
  });
});
