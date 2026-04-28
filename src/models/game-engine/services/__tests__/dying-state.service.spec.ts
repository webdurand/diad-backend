import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { DyingStateService } from "../dying-state.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

const PART_ID = "11111111-1111-4111-8111-111111111111";
const ENCOUNTER_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";

function makeRepo(initial: {
  dyingState?: string;
  currentHp?: number;
}): Repository<EncounterParticipantEntity> {
  const stored = {
    id: PART_ID,
    encounterId: ENCOUNTER_ID,
    dyingState: initial.dyingState ?? "none",
    currentHp: initial.currentHp ?? 1,
  } as unknown as EncounterParticipantEntity;
  return {
    findOne: jest.fn(async () => stored),
    save: jest.fn(async (p: EncounterParticipantEntity) => p),
  } as unknown as Repository<EncounterParticipantEntity>;
}

function makeBus(): EventBusService {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
  } as unknown as EventBusService;
}

describe("DyingStateService — Spec 020 transitions", () => {
  it("none → dying allowed (PC cai a 0HP)", async () => {
    const svc = new DyingStateService(
      makeRepo({ dyingState: "none" }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.setState({
      participantId: PART_ID,
      state: "dying",
      reason: "narrative_death",
      campaignId: CAMPAIGN_ID,
    });
    expect(result.previousState).toBe("none");
    expect(result.currentState).toBe("dying");
    expect(result.removedFromTurnOrder).toBe(true);
  });

  it("dying → stable allowed", async () => {
    const svc = new DyingStateService(
      makeRepo({ dyingState: "dying" }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.setState({
      participantId: PART_ID,
      state: "stable",
      reason: "stabilized",
    });
    expect(result.currentState).toBe("stable");
    expect(result.deathSavesReset).toBe(true);
  });

  it("dying → dead allowed", async () => {
    const svc = new DyingStateService(
      makeRepo({ dyingState: "dying" }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.setState({
      participantId: PART_ID,
      state: "dead",
      reason: "executed",
    });
    expect(result.currentState).toBe("dead");
  });

  it("captured allowed de qualquer estado (extensão DIAD)", async () => {
    const svc = new DyingStateService(
      makeRepo({ dyingState: "none" }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.setState({
      participantId: PART_ID,
      state: "captured",
      reason: "surrender",
    });
    expect(result.currentState).toBe("captured");
    expect(result.removedFromTurnOrder).toBe(true);
  });

  it("rejeita stable → none sem HP > 0 (DYING_STATE_REQUIRES_HP_RESTORE)", async () => {
    const svc = new DyingStateService(
      makeRepo({ dyingState: "stable", currentHp: 0 }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    await expect(
      svc.setState({
        participantId: PART_ID,
        state: "none",
        reason: "rescued",
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.DYING_STATE_REQUIRES_HP_RESTORE,
    });
  });

  it("permite stable → none com HP > 0", async () => {
    const svc = new DyingStateService(
      makeRepo({ dyingState: "stable", currentHp: 5 }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.setState({
      participantId: PART_ID,
      state: "none",
      reason: "rescued",
    });
    expect(result.currentState).toBe("none");
  });

  it("rejeita transição inválida (dead → dying)", async () => {
    const svc = new DyingStateService(
      makeRepo({ dyingState: "dead" }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    await expect(
      svc.setState({
        participantId: PART_ID,
        state: "dying",
        reason: "narrative_death",
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.DYING_STATE_TRANSITION_INVALID,
    });
  });

  it("permite dead → none (Revivify)", async () => {
    const svc = new DyingStateService(
      makeRepo({ dyingState: "dead", currentHp: 0 }),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.setState({
      participantId: PART_ID,
      state: "none",
      reason: "rescued",
    });
    expect(result.currentState).toBe("none");
  });

  it("estado igual = no-op idempotente (sem emit)", async () => {
    const bus = makeBus();
    const svc = new DyingStateService(
      makeRepo({ dyingState: "stable" }),
      bus,
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.setState({
      participantId: PART_ID,
      state: "stable",
      reason: "stabilized",
    });
    expect(result.previousState).toBe("stable");
    expect(result.currentState).toBe("stable");
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("rejeita participant não encontrado (PARTICIPANT_NOT_FOUND)", async () => {
    const repo = {
      findOne: jest.fn(async () => null),
      save: jest.fn(),
    } as unknown as Repository<EncounterParticipantEntity>;
    const svc = new DyingStateService(
      repo,
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    await expect(
      svc.setState({
        participantId: PART_ID,
        state: "dying",
        reason: "narrative_death",
      }),
    ).rejects.toBeInstanceOf(DomainException);
  });
});
