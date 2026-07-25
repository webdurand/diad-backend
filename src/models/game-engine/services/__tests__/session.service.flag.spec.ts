import { SessionService } from "../session.service";

const makeLogger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

function makeService(sessionRepo: Record<string, any>) {
  return new SessionService(
    sessionRepo as any,
    { findOne: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    { find: jest.fn().mockResolvedValue([]) } as any,
    { find: jest.fn().mockResolvedValue([]) } as any,
    { find: jest.fn().mockResolvedValue([]) } as any,
    { find: jest.fn().mockResolvedValue([]) } as any,
    {} as any,
    { create: jest.fn(), revealQuest: jest.fn() } as any,
    { bootstrapStoryFirst: jest.fn() } as any,
    { listByPoi: jest.fn().mockResolvedValue([]) } as any,
    { ensureDefaultForLocation: jest.fn() } as any,
    {} as any,
    makeLogger() as any,
  );
}

describe("SessionService hubPoiEnabled flag", () => {
  it("cria sessoes novas com hubPoiEnabled=true por padrao", async () => {
    const sessionRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: "session-1", ...value })),
    };
    const service = makeService(sessionRepo);

    await service.create("user-1", { name: "Nova sessão" });

    expect(sessionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ hubPoiEnabled: true }),
      }),
    );
  });

  it("permite override false para rollback por sessao", async () => {
    const sessionRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: "session-1", ...value })),
    };
    const service = makeService(sessionRepo);

    await service.create("user-1", {
      name: "Nova sessão",
      config: { hubPoiEnabled: false },
    });

    expect(sessionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ hubPoiEnabled: false }),
      }),
    );
  });
});
