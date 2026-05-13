import { LegendaryActionsCoordinator } from "../legendary-actions-coordinator.service";
import type { EncounterEntity } from "src/entities/encounter.entity";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";

const ENC_ID = "11111111-1111-4111-8111-111111111111";
const PC_ID = "22222222-2222-4222-8222-222222222222";
const MON_ID = "33333333-3333-4333-8333-333333333333";

function makeMonster(
  overrides: Partial<EncounterParticipantEntity> = {},
): EncounterParticipantEntity {
  return {
    id: MON_ID,
    encounterId: ENC_ID,
    type: "monster",
    isDefeated: false,
    dyingState: "none",
    legendaryPointsAvailable: 3,
    legendaryPointsMax: 3,
    conditions: [],
    conditionInstances: [],
    monster: {
      legendary_action_cost_map: { "Tail Attack": 1, "Wing Buffet": 2 },
    },
    ...overrides,
  } as unknown as EncounterParticipantEntity;
}

function makeCoordinator(opts: {
  monsters: EncounterParticipantEntity[];
  decision: { spend: boolean; actionName?: string; cost?: number };
  canExecute?: { ok: boolean; cost?: 1 | 2 | 3 };
}) {
  const participantRepo = {
    find: jest.fn(async () => opts.monsters),
    findOne: jest.fn(async ({ where }: any) =>
      opts.monsters.find((m) => m.id === where.id),
    ),
  } as any;
  const legendaryService = {
    canExecute: jest.fn(() =>
      opts.canExecute
        ? opts.canExecute.ok
          ? { ok: true, value: { cost: opts.canExecute.cost ?? 1 } }
          : { ok: false, code: "INSUFFICIENT_LEGENDARY_POINTS" }
        : { ok: true, value: { cost: 1 } },
    ),
    spendPoints: jest.fn(async (_m: any, cost: number, name: string) => ({
      events: [
        {
          event_type: "legendary_action_used",
          actor_participant_id: MON_ID,
          data: { actionName: name, cost, legendaryPointsRemaining: 3 - cost },
        },
      ],
      result: {
        monsterParticipantId: MON_ID,
        actionName: name,
        cost,
        legendaryPointsRemaining: 3 - cost,
        legendaryPointsMax: 3,
      },
    })),
  } as any;
  const snapshotService = {
    build: jest.fn(async () => ({ ok: true, value: { encounterId: ENC_ID } })),
  } as any;
  const aiProxy = {
    decideLegendary: jest.fn(async () => ({
      spend: opts.decision.spend,
      actionName: opts.decision.actionName,
      cost: opts.decision.cost,
      tookMs: 1,
      decisionMode: "rule-based",
    })),
  } as any;
  const coord = new LegendaryActionsCoordinator(
    participantRepo,
    legendaryService,
    snapshotService,
    aiProxy,
  );
  return { coord, participantRepo, legendaryService, snapshotService, aiProxy };
}

describe("LegendaryActionsCoordinator", () => {
  it("retorna [] quando nenhum monstro elegível", async () => {
    const { coord } = makeCoordinator({
      monsters: [makeMonster({ legendaryPointsAvailable: null as any })],
      decision: { spend: false },
    });
    const enc = { id: ENC_ID } as EncounterEntity;
    const events = await coord.processAfterPcTurn(enc, PC_ID);
    expect(events).toEqual([]);
  });

  it("não dispara em monstro com legendaryPointsAvailable=0", async () => {
    const { coord, aiProxy } = makeCoordinator({
      monsters: [makeMonster({ legendaryPointsAvailable: 0 })],
      decision: { spend: true },
    });
    const enc = { id: ENC_ID } as EncounterEntity;
    await coord.processAfterPcTurn(enc, PC_ID);
    expect(aiProxy.decideLegendary).not.toHaveBeenCalled();
  });

  it("não dispara em monstro derrotado", async () => {
    const { coord, aiProxy } = makeCoordinator({
      monsters: [makeMonster({ isDefeated: true })],
      decision: { spend: true },
    });
    const enc = { id: ENC_ID } as EncounterEntity;
    await coord.processAfterPcTurn(enc, PC_ID);
    expect(aiProxy.decideLegendary).not.toHaveBeenCalled();
  });

  it("gasta pontos quando agents decide spend=true", async () => {
    const { coord, legendaryService, aiProxy } = makeCoordinator({
      monsters: [makeMonster()],
      decision: { spend: true, actionName: "Tail Attack", cost: 1 },
      canExecute: { ok: true, cost: 1 },
    });
    const enc = { id: ENC_ID } as EncounterEntity;
    const events = await coord.processAfterPcTurn(enc, PC_ID);
    expect(aiProxy.decideLegendary).toHaveBeenCalledWith({
      snapshot: expect.objectContaining({ encounterId: ENC_ID }),
      monsterParticipantId: MON_ID,
      triggerEvent: "after-pc-turn",
    });
    expect(legendaryService.spendPoints).toHaveBeenCalledWith(
      expect.any(Object),
      1,
      "Tail Attack",
    );
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe("legendary_action_used");
  });

  it("não gasta pontos quando spend=false", async () => {
    const { coord, legendaryService } = makeCoordinator({
      monsters: [makeMonster()],
      decision: { spend: false },
    });
    const enc = { id: ENC_ID } as EncounterEntity;
    await coord.processAfterPcTurn(enc, PC_ID);
    expect(legendaryService.spendPoints).not.toHaveBeenCalled();
  });

  it("não gasta quando canExecute retorna failure", async () => {
    const { coord, legendaryService } = makeCoordinator({
      monsters: [makeMonster()],
      decision: { spend: true, actionName: "Wing Buffet", cost: 2 },
      canExecute: { ok: false },
    });
    const enc = { id: ENC_ID } as EncounterEntity;
    await coord.processAfterPcTurn(enc, PC_ID);
    expect(legendaryService.spendPoints).not.toHaveBeenCalled();
  });

  it("excluiu o próprio PC participant da lista de eligible", async () => {
    const pcMon = makeMonster({ id: PC_ID, type: "pc" } as any);
    const { coord, aiProxy } = makeCoordinator({
      monsters: [pcMon, makeMonster()],
      decision: { spend: true, actionName: "Tail Attack", cost: 1 },
    });
    const enc = { id: ENC_ID } as EncounterEntity;
    await coord.processAfterPcTurn(enc, PC_ID);

    expect(aiProxy.decideLegendary).toHaveBeenCalledTimes(1);
    expect(aiProxy.decideLegendary).toHaveBeenCalledWith(
      expect.objectContaining({ monsterParticipantId: MON_ID }),
    );
  });
});
