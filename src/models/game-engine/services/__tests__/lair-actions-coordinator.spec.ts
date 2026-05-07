import { LairActionsCoordinator } from "../lair-actions-coordinator.service";
import type { EncounterEntity } from "src/entities/encounter.entity";

const ENC_ID = "11111111-1111-4111-8111-111111111111";
const MON_ID = "22222222-2222-4222-8222-222222222222";

function makeCoordinator(opts: {
  inLair: boolean;
  available: any[];
  decision: { actionIndex: number | null };
  executeOk?: boolean;
}) {
  const lairService = {
    availableForRound: jest.fn(async () => opts.available),
    execute: jest.fn(async () => ({
      ok: opts.executeOk ?? true,
      value: { monsterParticipantId: MON_ID, skipped: false },
      events: opts.executeOk !== false
        ? [{ event_type: "lair_action_used", actor_participant_id: MON_ID, data: {} }]
        : [],
    })),
  } as any;
  const snapshotService = {
    build: jest.fn(async () => ({ ok: true, value: { encounterId: ENC_ID } })),
  } as any;
  const aiProxy = {
    decideLair: jest.fn(async () => ({
      actionIndex: opts.decision.actionIndex,
      tookMs: 1,
      decisionMode: "rule-based",
    })),
  } as any;
  const coord = new LairActionsCoordinator(lairService, snapshotService, aiProxy);
  return { coord, lairService, snapshotService, aiProxy };
}

describe("LairActionsCoordinator", () => {
  it("retorna [] quando inLair=false", async () => {
    const { coord, lairService } = makeCoordinator({
      inLair: false,
      available: [],
      decision: { actionIndex: null },
    });
    const enc = { id: ENC_ID, inLair: false } as EncounterEntity;
    const events = await coord.processRoundStart(enc);
    expect(events).toEqual([]);
    expect(lairService.availableForRound).not.toHaveBeenCalled();
  });

  it("retorna [] quando inLair=true mas nenhum monstro lendário disponível", async () => {
    const { coord } = makeCoordinator({
      inLair: true,
      available: [],
      decision: { actionIndex: 0 },
    });
    const enc = { id: ENC_ID, inLair: true } as EncounterEntity;
    const events = await coord.processRoundStart(enc);
    expect(events).toEqual([]);
  });

  it("executa ação quando agents retorna actionIndex válido", async () => {
    const { coord, aiProxy, lairService } = makeCoordinator({
      inLair: true,
      available: [
        {
          participantId: MON_ID,
          monsterName: "Lich",
          options: [{ name: "Tremor", description: "..." }],
        },
      ],
      decision: { actionIndex: 0 },
    });
    const enc = { id: ENC_ID, inLair: true } as EncounterEntity;
    const events = await coord.processRoundStart(enc);
    expect(aiProxy.decideLair).toHaveBeenCalledWith({
      snapshot: expect.objectContaining({ encounterId: ENC_ID }),
      monsterParticipantId: MON_ID,
    });
    expect(lairService.execute).toHaveBeenCalledWith(enc, MON_ID, 0);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe("lair_action_used");
  });

  it("não executa quando agents retorna actionIndex=null (skip)", async () => {
    const { coord, lairService } = makeCoordinator({
      inLair: true,
      available: [{ participantId: MON_ID, monsterName: "Lich", options: [] }],
      decision: { actionIndex: null },
    });
    const enc = { id: ENC_ID, inLair: true } as EncounterEntity;
    await coord.processRoundStart(enc);
    expect(lairService.execute).not.toHaveBeenCalled();
  });

  it("falha de agents (exception) não aborta — só loga e retorna []", async () => {
    const { coord, lairService } = makeCoordinator({
      inLair: true,
      available: [{ participantId: MON_ID, monsterName: "Lich", options: [] }],
      decision: { actionIndex: 0 },
    });
    (coord as any).aiProxy.decideLair = jest.fn(async () => {
      throw new Error("agents down");
    });
    const enc = { id: ENC_ID, inLair: true } as EncounterEntity;
    const events = await coord.processRoundStart(enc);
    expect(events).toEqual([]);
    expect(lairService.execute).not.toHaveBeenCalled();
  });
});
