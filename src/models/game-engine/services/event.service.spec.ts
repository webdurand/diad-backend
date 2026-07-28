import { DataSource, EntityManager, Repository } from "typeorm";
import { GameEventEntity } from "src/entities/game-event.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { GameEventData } from "../interfaces/result.type";
import { EventService } from "./event.service";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const ENCOUNTER_ID = "00000000-0000-4000-8000-000000000002";
const ACTOR_ID = "00000000-0000-4000-8000-000000000010";
const TARGET_ID = "00000000-0000-4000-8000-000000000011";

interface ManagerMockOptions {
  maxSequence?: number;
  participants?: Array<{ id: string; displayName: string }>;
}

interface EmitContext {
  service: EventService;
  manager: EntityManager;
  dataSource: DataSource;
  transactionFn: jest.Mock;
  queries: Array<{ sql: string; params?: unknown[] }>;
  created: Array<Record<string, any>>;
  participantFilters: Array<Record<string, unknown> | undefined>;
  sequenceLookups: number;
}

function buildContext(opts: ManagerMockOptions = {}): EmitContext {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const created: Array<Record<string, any>> = [];
  const participantFilters: Array<Record<string, unknown> | undefined> = [];
  const counters = { sequenceLookups: 0 };

  const manager = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return [];
    }),
    createQueryBuilder: jest.fn((entity: unknown) => {
      if (entity === GameEventEntity) {
        const qb: any = {
          select: jest.fn(() => qb),
          where: jest.fn(() => qb),
          getRawOne: jest.fn(async () => {
            counters.sequenceLookups += 1;
            return { max: String(opts.maxSequence ?? 0) };
          }),
        };
        return qb;
      }
      const qb: any = {
        select: jest.fn(() => qb),
        where: jest.fn((_clause: string, params?: Record<string, unknown>) => {
          participantFilters.push(params);
          return qb;
        }),
        getMany: jest.fn(async () => opts.participants ?? []),
      };
      return qb;
    }),
    create: jest.fn((_entity: unknown, payload: Record<string, any>) => {
      created.push(payload);
      return { ...payload };
    }),
    save: jest.fn(async (_entity: unknown, entities: unknown) => entities),
  } as unknown as EntityManager;

  const transactionFn = jest.fn(async (cb: (m: EntityManager) => unknown) =>
    cb(manager),
  );
  const dataSource = {
    transaction: transactionFn,
  } as unknown as DataSource;
  const eventRepo = {} as unknown as Repository<GameEventEntity>;

  return {
    service: new EventService(eventRepo, dataSource),
    manager,
    dataSource,
    transactionFn,
    queries,
    created,
    participantFilters,
    get sequenceLookups() {
      return counters.sequenceLookups;
    },
  };
}

function event(overrides: Partial<GameEventData> = {}): GameEventData {
  return {
    event_type: "attack_resolved",
    data: {},
    ...overrides,
  };
}

describe("EventService.emit — alocação de sequence", () => {
  it("aloca sequences contíguas a partir de MAX(sequence)+1 para o lote inteiro", async () => {
    const ctx = buildContext({ maxSequence: 4 });

    await ctx.service.emit(SESSION_ID, ENCOUNTER_ID, [
      event({ event_type: "attack_declared" }),
      event({ event_type: "attack_roll" }),
      event({ event_type: "damage_applied" }),
    ]);

    expect(ctx.created.map((e) => e.sequence)).toEqual([5, 6, 7]);
    // Um único MAX(sequence) para todo o lote: a alocação é aritmética a partir
    // dele, não uma consulta por evento.
    expect(ctx.sequenceLookups).toBe(1);
  });

  it("começa em 1 quando a sessão ainda não tem eventos", async () => {
    const ctx = buildContext({ maxSequence: 0 });

    await ctx.service.emit(SESSION_ID, null, [event()]);

    expect(ctx.created.map((e) => e.sequence)).toEqual([1]);
  });

  it("adquire pg_advisory_xact_lock(hashtext('game_event:<id>')) ANTES do MAX(seq)", async () => {
    const ctx = buildContext({ maxSequence: 2 });

    await ctx.service.emit(SESSION_ID, ENCOUNTER_ID, [event()]);

    expect(ctx.queries[0].sql).toContain("pg_advisory_xact_lock");
    expect(ctx.queries[0].sql).toContain("hashtext");
    expect(ctx.queries[0].params).toEqual([`game_event:${SESSION_ID}`]);
  });
});

describe("EventService.emit — backfill de nomes de participantes", () => {
  it("preenche actorName/targetName quando ausentes em data", async () => {
    const ctx = buildContext({
      maxSequence: 0,
      participants: [
        { id: ACTOR_ID, displayName: "Aelin" },
        { id: TARGET_ID, displayName: "Goblin 1" },
      ],
    });

    await ctx.service.emit(SESSION_ID, ENCOUNTER_ID, [
      event({
        actor_participant_id: ACTOR_ID,
        target_participant_id: TARGET_ID,
        data: { damage: 7 },
      }),
    ]);

    expect(ctx.created[0].data).toEqual({
      damage: 7,
      actorName: "Aelin",
      targetName: "Goblin 1",
    });
  });

  it("não sobrescreve actorName/targetName já presentes em data", async () => {
    const ctx = buildContext({
      maxSequence: 0,
      participants: [
        { id: ACTOR_ID, displayName: "Aelin" },
        { id: TARGET_ID, displayName: "Goblin 1" },
      ],
    });

    await ctx.service.emit(SESSION_ID, ENCOUNTER_ID, [
      event({
        actor_participant_id: ACTOR_ID,
        target_participant_id: TARGET_ID,
        data: { actorName: "Aelin Disfarçada", targetName: "Sombra" },
      }),
    ]);

    expect(ctx.created[0].data).toEqual({
      actorName: "Aelin Disfarçada",
      targetName: "Sombra",
    });
  });

  it("consulta cada participante uma única vez para o lote todo", async () => {
    const ctx = buildContext({
      maxSequence: 0,
      participants: [
        { id: ACTOR_ID, displayName: "Aelin" },
        { id: TARGET_ID, displayName: "Goblin 1" },
      ],
    });

    await ctx.service.emit(SESSION_ID, ENCOUNTER_ID, [
      event({
        actor_participant_id: ACTOR_ID,
        target_participant_id: TARGET_ID,
      }),
      event({
        actor_participant_id: TARGET_ID,
        target_participant_id: ACTOR_ID,
      }),
      event({ actor_participant_id: ACTOR_ID }),
    ]);

    expect(ctx.participantFilters).toEqual([
      { participantIds: [ACTOR_ID, TARGET_ID] },
    ]);
  });

  it("não consulta participantes quando nenhum evento referencia participante", async () => {
    const ctx = buildContext({ maxSequence: 0 });

    await ctx.service.emit(SESSION_ID, ENCOUNTER_ID, [
      event({ event_type: "round_started", data: { round: 2 } }),
    ]);

    expect(ctx.participantFilters).toEqual([]);
    expect(ctx.created[0].data).toEqual({ round: 2 });
  });

  it("mantém data intacta quando o participante não é encontrado", async () => {
    const ctx = buildContext({ maxSequence: 0, participants: [] });

    await ctx.service.emit(SESSION_ID, ENCOUNTER_ID, [
      event({ actor_participant_id: ACTOR_ID, data: { hit: true } }),
    ]);

    expect(ctx.created[0].data).toEqual({ hit: true });
  });
});

describe("EventService.emit — transação", () => {
  it("lote vazio é no-op: não abre transação nem toca no banco", async () => {
    const ctx = buildContext();

    const result = await ctx.service.emit(SESSION_ID, ENCOUNTER_ID, []);

    expect(result).toEqual([]);
    expect(ctx.transactionFn).not.toHaveBeenCalled();
    expect(ctx.manager.query).not.toHaveBeenCalled();
    expect(ctx.manager.createQueryBuilder).not.toHaveBeenCalled();
    expect(ctx.manager.save).not.toHaveBeenCalled();
  });

  it("abre uma única transação quando não recebe manager externo", async () => {
    const ctx = buildContext({ maxSequence: 0 });

    await ctx.service.emit(SESSION_ID, ENCOUNTER_ID, [event(), event()]);

    expect(ctx.transactionFn).toHaveBeenCalledTimes(1);
  });

  it("manager externo NÃO abre transação aninhada (o lock precisa viver na tx do chamador)", async () => {
    const ctx = buildContext({ maxSequence: 9 });

    await ctx.service.emit(SESSION_ID, ENCOUNTER_ID, [event()], ctx.manager);

    expect(ctx.transactionFn).not.toHaveBeenCalled();
    expect(ctx.queries[0].sql).toContain("pg_advisory_xact_lock");
    expect(ctx.created.map((e) => e.sequence)).toEqual([10]);
  });

  it("persiste o lote inteiro em um único save", async () => {
    const ctx = buildContext({ maxSequence: 0 });

    await ctx.service.emit(SESSION_ID, ENCOUNTER_ID, [event(), event()]);

    expect(ctx.manager.save).toHaveBeenCalledTimes(1);
    expect(ctx.manager.save).toHaveBeenCalledWith(
      GameEventEntity,
      expect.arrayContaining([expect.objectContaining({ sequence: 1 })]),
    );
  });

  it("mapeia encounterId null para undefined (coluna nullable)", async () => {
    const ctx = buildContext({ maxSequence: 0 });

    await ctx.service.emit(SESSION_ID, null, [event()]);

    expect(ctx.created[0].encounterId).toBeUndefined();
    expect(ctx.created[0].sessionId).toBe(SESSION_ID);
  });
});

describe("EventService.emit — participantes consultados no manager da transação", () => {
  it("usa o EntityManager da transação para ler os participantes", async () => {
    const ctx = buildContext({
      maxSequence: 0,
      participants: [{ id: ACTOR_ID, displayName: "Aelin" }],
    });

    await ctx.service.emit(SESSION_ID, ENCOUNTER_ID, [
      event({ actor_participant_id: ACTOR_ID }),
    ]);

    expect(ctx.manager.createQueryBuilder).toHaveBeenCalledWith(
      EncounterParticipantEntity,
      "participant",
    );
  });
});
