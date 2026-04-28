import { Repository } from "typeorm";
import { CharacterEntity } from "src/entities/character.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { RevivifyCheckService } from "../revivify-check.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

const CHAR_ID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";

function makeCharRepo(
  char: Partial<CharacterEntity> | null = { id: CHAR_ID, name: "Aa" },
): Repository<CharacterEntity> {
  return {
    findOne: jest.fn(async () => char as CharacterEntity | null),
  } as unknown as Repository<CharacterEntity>;
}

function makePartRepo(
  part: Partial<EncounterParticipantEntity> | null = { dyingState: "dead" },
): Repository<EncounterParticipantEntity> {
  return {
    findOne: jest.fn(async () => part as EncounterParticipantEntity | null),
  } as unknown as Repository<EncounterParticipantEntity>;
}

function makeBus(): EventBusService {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
  } as unknown as EventBusService;
}

describe("RevivifyCheckService — Spec 020 RAW pure", () => {
  it("eligible quando todos pré-requisitos batem (≤1min, diamond, body intact, dead)", async () => {
    const svc = new RevivifyCheckService(
      makeCharRepo(),
      makePartRepo({ dyingState: "dead" }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.check({
      characterId: CHAR_ID,
      timeSinceDeathMin: 0.5,
      hasDiamond300gp: true,
    });
    expect(result.eligible).toBe(true);
    expect(result.missingRequirements).toEqual([]);
    expect(result.windowRemainingSec).toBe(30);
  });

  it("ineligible — janela RAW excedida (>1min)", async () => {
    const svc = new RevivifyCheckService(
      makeCharRepo(),
      makePartRepo({ dyingState: "dead" }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.check({
      characterId: CHAR_ID,
      timeSinceDeathMin: 1.5,
      hasDiamond300gp: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.missingRequirements).toContain("time_window_exceeded");
    expect(result.windowRemainingSec).toBe(0);
  });

  it("ineligible — diamond ausente", async () => {
    const svc = new RevivifyCheckService(
      makeCharRepo(),
      makePartRepo({ dyingState: "dead" }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.check({
      characterId: CHAR_ID,
      timeSinceDeathMin: 0.5,
      hasDiamond300gp: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.missingRequirements).toContain("missing_diamond_300gp");
  });

  it("rejeita target não-morto (REVIVIFY_TARGET_NOT_DEAD)", async () => {
    const svc = new RevivifyCheckService(
      makeCharRepo(),
      makePartRepo({ dyingState: "dying" }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    await expect(
      svc.check({
        characterId: CHAR_ID,
        timeSinceDeathMin: 0.1,
        hasDiamond300gp: true,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.REVIVIFY_TARGET_NOT_DEAD });
  });

  it("targetDyingState override permite testar sem participant", async () => {
    const svc = new RevivifyCheckService(
      makeCharRepo(),
      makePartRepo(null),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.check({
      characterId: CHAR_ID,
      timeSinceDeathMin: 0.3,
      hasDiamond300gp: true,
      targetDyingState: "dead",
    });
    expect(result.eligible).toBe(true);
  });

  it("rejeita corpo destruído (REVIVIFY_BODY_DESTROYED)", async () => {
    const svc = new RevivifyCheckService(
      makeCharRepo(),
      makePartRepo({ dyingState: "dead" }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    await expect(
      svc.check({
        characterId: CHAR_ID,
        timeSinceDeathMin: 0.1,
        hasDiamond300gp: true,
        bodyDestroyed: true,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.REVIVIFY_BODY_DESTROYED });
  });

  it("rejeita character não encontrado (CHARACTER_NOT_FOUND)", async () => {
    const svc = new RevivifyCheckService(
      makeCharRepo(null),
      makePartRepo(null),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    await expect(
      svc.check({
        characterId: CHAR_ID,
        timeSinceDeathMin: 0,
        hasDiamond300gp: true,
      }),
    ).rejects.toBeInstanceOf(DomainException);
  });

  it("emite NarrativeEvent.revivify_eligibility_checked quando campaignId provided", async () => {
    const bus = makeBus();
    const svc = new RevivifyCheckService(
      makeCharRepo(),
      makePartRepo({ dyingState: "dead" }),
      bus,
      new EventEnvelopeFactory(undefined),
    );
    await svc.check({
      characterId: CHAR_ID,
      timeSinceDeathMin: 0.3,
      hasDiamond300gp: true,
      campaignId: CAMPAIGN_ID,
    });
    expect(bus.publish).toHaveBeenCalled();
  });

  it("janela limite — 60s (1.0 min) ainda eligible", async () => {
    const svc = new RevivifyCheckService(
      makeCharRepo(),
      makePartRepo({ dyingState: "dead" }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.check({
      characterId: CHAR_ID,
      timeSinceDeathMin: 1.0,
      hasDiamond300gp: true,
    });
    expect(result.eligible).toBe(true);
    expect(result.windowRemainingSec).toBe(0);
  });
});
