import { DataSource, EntityManager, Repository } from "typeorm";
import { SessionMessageService } from "../session-message.service";
import { SessionMessageEntity } from "src/entities/session-message.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";


describe("SessionMessageService.getMaxSequenceNumber", () => {
  function makeQueryBuilder(rawResult: { max: string | null } | null) {
    return {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(rawResult),
    };
  }

  function buildService(qb: ReturnType<typeof makeQueryBuilder>) {
    const messageRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<SessionMessageEntity>;
    const sessionRepo = {} as unknown as Repository<GameSessionEntity>;
    const dataSource = {} as unknown as DataSource;
    return new SessionMessageService(messageRepo, sessionRepo, dataSource);
  }

  it("retorna 0 para sessão sem mensagens (COALESCE)", async () => {
    const qb = makeQueryBuilder({ max: "0" });
    const service = buildService(qb);
    const result = await service.getMaxSequenceNumber("session-uuid");
    expect(result).toBe(0);

    expect(qb.select).toHaveBeenCalledWith(
      "COALESCE(MAX(m.sequence_number), 0)",
      "max",
    );
    expect(qb.where).toHaveBeenCalledWith("m.session_id = :sessionId", {
      sessionId: "session-uuid",
    });
  });

  it("retorna o max correto após N appends", async () => {
    const qb = makeQueryBuilder({ max: "42" });
    const service = buildService(qb);
    const result = await service.getMaxSequenceNumber("session-uuid");
    expect(result).toBe(42);
  });

  it("retorna 0 quando getRawOne devolve null (defensivo)", async () => {
    const qb = makeQueryBuilder(null);
    const service = buildService(qb);
    const result = await service.getMaxSequenceNumber("session-uuid");
    expect(result).toBe(0);
  });

  it("retorna 0 quando max parsing falha (string vazia)", async () => {
    const qb = makeQueryBuilder({ max: "" });
    const service = buildService(qb);
    const result = await service.getMaxSequenceNumber("session-uuid");
    expect(result).toBe(0);
  });
});

describe("SessionMessageService.listBySession", () => {
  const SESSION_ID = "00000000-0000-4000-8000-000000000001";
  const USER_ID = "00000000-0000-4000-8000-000000000002";

  interface MessageQueryBuilderMock {
    where: jest.Mock<
      MessageQueryBuilderMock,
      [string, Record<string, unknown>?]
    >;
    orderBy: jest.Mock<MessageQueryBuilderMock, [string, "ASC" | "DESC"]>;
    take: jest.Mock<MessageQueryBuilderMock, [number]>;
    andWhere: jest.Mock<
      MessageQueryBuilderMock,
      [string, Record<string, unknown>]
    >;
    getMany: jest.Mock<Promise<SessionMessageEntity[]>, []>;
  }

  function buildService(messages: SessionMessageEntity[]) {
    const qb = {} as MessageQueryBuilderMock;
    qb.where = jest.fn(
      (_clause: string, _params?: Record<string, unknown>) => qb,
    );
    qb.orderBy = jest.fn((_field: string, _order: "ASC" | "DESC") => qb);
    qb.take = jest.fn((_limit: number) => qb);
    qb.andWhere = jest.fn(
      (_clause: string, _params: Record<string, unknown>) => qb,
    );
    qb.getMany = jest.fn().mockResolvedValue(messages);

    const messageRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<SessionMessageEntity>;
    const sessionRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: SESSION_ID, ownerId: USER_ID }),
    } as unknown as Repository<GameSessionEntity>;
    const dataSource = {} as unknown as DataSource;

    return {
      service: new SessionMessageService(messageRepo, sessionRepo, dataSource),
      qb,
    };
  }

  it("sem cursor retorna a janela mais recente em ordem cronologica", async () => {
    const newestFirst = [
      { id: "m-5", sequenceNumber: 5 },
      { id: "m-4", sequenceNumber: 4 },
    ] as SessionMessageEntity[];
    const ctx = buildService(newestFirst);

    const result = await ctx.service.listBySession(SESSION_ID, USER_ID, 2);

    expect(ctx.qb.orderBy).toHaveBeenCalledWith("m.sequence_number", "DESC");
    expect(ctx.qb.take).toHaveBeenCalledWith(2);
    expect(result.map((m) => m.sequenceNumber)).toEqual([4, 5]);
  });

  it("com cursor busca mensagens novas em ordem ascendente", async () => {
    const newestAfterCursor = [
      { id: "m-6", sequenceNumber: 6 },
      { id: "m-7", sequenceNumber: 7 },
    ] as SessionMessageEntity[];
    const ctx = buildService(newestAfterCursor);

    const result = await ctx.service.listBySession(SESSION_ID, USER_ID, 20, 5);

    expect(ctx.qb.orderBy).toHaveBeenCalledWith("m.sequence_number", "ASC");
    expect(ctx.qb.andWhere).toHaveBeenCalledWith(
      "m.sequence_number > :afterSequence",
      { afterSequence: 5 },
    );
    expect(result.map((m) => m.sequenceNumber)).toEqual([6, 7]);
  });
});


describe("SessionMessageService.append — atomic sequence (spec 027)", () => {
  const SESSION_ID = "00000000-0000-4000-8000-000000000001";
  const USER_ID = "00000000-0000-4000-8000-000000000002";

  function buildService(opts: {
    existingByClientId?: SessionMessageEntity | null;
    existingSequence?: number;
    sessionOwnerId?: string;
  }) {
    const queries: string[] = [];
    const findOneCalls: any[] = [];
    const saveCalls: any[] = [];
    const createCalls: any[] = [];

    const txManager = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        queries.push(sql);
        return [];
      }),
      findOne: jest.fn(async (_entity: any, where: any) => {
        findOneCalls.push(where);
        return opts.existingByClientId ?? null;
      }),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          select: jest.fn(() => qb),
          where: jest.fn(() => qb),
          getRawOne: jest
            .fn()
            .mockResolvedValue({ max: String(opts.existingSequence ?? 0) }),
        };
        return qb;
      }),
      create: jest.fn((_entity: any, payload: any) => {
        createCalls.push(payload);
        return { ...payload };
      }),
      save: jest.fn(async (_entity: any, payload: any) => {
        saveCalls.push(payload);
        return { id: "msg-uuid", ...payload };
      }),
    } as unknown as EntityManager;

    const transactionFn = jest.fn(async (cb: (m: EntityManager) => any) => {

      return cb(txManager);
    });

    const dataSource = {
      transaction: transactionFn,
    } as unknown as DataSource;

    const messageRepo = {
      createQueryBuilder: jest.fn(),
    } as unknown as Repository<SessionMessageEntity>;
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: SESSION_ID,
        ownerId: opts.sessionOwnerId ?? USER_ID,
      }),
    } as unknown as Repository<GameSessionEntity>;

    const service = new SessionMessageService(
      messageRepo,
      sessionRepo,
      dataSource,
    );

    return {
      service,
      queries,
      findOneCalls,
      saveCalls,
      createCalls,
      transactionFn,
      txManager: txManager as any,
    };
  }

  it("adquire pg_advisory_xact_lock(hashtext('session_msg:<id>')) ANTES do MAX(seq)", async () => {
    const ctx = buildService({ existingSequence: 4 });
    const result = await ctx.service.append({
      sessionId: SESSION_ID,
      userId: USER_ID,
      kind: "narration",
      content: "ok",
    });


    expect(ctx.queries[0]).toContain("pg_advisory_xact_lock");
    expect(ctx.queries[0]).toContain("hashtext");

    expect(ctx.txManager.query).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock"),
      [`session_msg:${SESSION_ID}`],
    );

    expect(result.sequenceNumber).toBe(5);
    expect(ctx.transactionFn).toHaveBeenCalledTimes(1);
  });

  it("dedup por clientId acontece DENTRO da transação (após lock)", async () => {
    const existing = {
      id: "existing-uuid",
      sessionId: SESSION_ID,
      sequenceNumber: 7,
      clientId: "entry-3",
    } as unknown as SessionMessageEntity;
    const ctx = buildService({ existingByClientId: existing });

    const result = await ctx.service.append({
      sessionId: SESSION_ID,
      userId: USER_ID,
      kind: "player_action",
      content: "atacar goblin",
      clientId: "entry-3",
    });


    expect(ctx.queries[0]).toContain("pg_advisory_xact_lock");
    expect(ctx.findOneCalls[0]).toEqual({
      where: { sessionId: SESSION_ID, clientId: "entry-3" },
    });
    expect(ctx.saveCalls.length).toBe(0);
    expect(result).toBe(existing);
  });

  it("não chama lock nem transação se kind for inválido", async () => {
    const ctx = buildService({});
    await expect(
      ctx.service.append({
        sessionId: SESSION_ID,
        userId: USER_ID,
        kind: "invalid_kind" as any,
        content: "x",
      }),
    ).rejects.toThrow();
    expect(ctx.transactionFn).not.toHaveBeenCalled();
  });

  it("rejeita ANTES da transação quando user não é dono (lock fica fora do hot path)", async () => {
    const ctx = buildService({ sessionOwnerId: "outro-user-uuid" });
    await expect(
      ctx.service.append({
        sessionId: SESSION_ID,
        userId: USER_ID,
        kind: "narration",
        content: "x",
      }),
    ).rejects.toThrow();
    expect(ctx.transactionFn).not.toHaveBeenCalled();
  });

  it("10 chamadas concorrentes geram sequences contíguas 1..10 (mock simulando lock real)", async () => {

    let currentMax = 0;
    let chain: Promise<unknown> = Promise.resolve();

    const txManager = {
      query: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest
          .fn()
          .mockImplementation(async () => ({ max: String(currentMax) })),
      })),
      create: jest.fn((_e: any, payload: any) => payload),
      save: jest.fn(async (_e: any, payload: any) => {
        currentMax = payload.sequenceNumber;
        return { id: `m-${payload.sequenceNumber}`, ...payload };
      }),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => any) => {

        const next = chain.then(() => cb(txManager));
        chain = next.catch(() => undefined);
        return next;
      }),
    } as unknown as DataSource;

    const sessionRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: SESSION_ID, ownerId: USER_ID }),
    } as unknown as Repository<GameSessionEntity>;
    const messageRepo = {} as unknown as Repository<SessionMessageEntity>;

    const service = new SessionMessageService(
      messageRepo,
      sessionRepo,
      dataSource,
    );

    const dispatched = Array.from({ length: 10 }).map((_, i) =>
      service.append({
        sessionId: SESSION_ID,
        userId: USER_ID,
        kind: "narration",
        content: `chunk ${i}`,
      }),
    );
    const results = await Promise.all(dispatched);
    const sequences = results
      .map((r) => r.sequenceNumber)
      .sort((a, b) => a - b);

    expect(sequences).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect((dataSource.transaction as jest.Mock).mock.calls.length).toBe(10);
  });
});
