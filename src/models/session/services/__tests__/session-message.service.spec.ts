import { Repository } from "typeorm";
import { SessionMessageService } from "../session-message.service";
import { SessionMessageEntity } from "src/entities/session-message.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";

/**
 * Spec 024 follow-up — `getMaxSequenceNumber` é o helper público consumido
 * pelo ai-proxy controller para emitir o chunk SSE `session_sync` com o
 * `lastSequenceNumber` server-authoritative ao final de cada turn.
 */
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
    return new SessionMessageService(messageRepo, sessionRepo);
  }

  it("retorna 0 para sessão sem mensagens (COALESCE)", async () => {
    const qb = makeQueryBuilder({ max: "0" });
    const service = buildService(qb);
    const result = await service.getMaxSequenceNumber("session-uuid");
    expect(result).toBe(0);
    // Confirma uso do mesmo SQL que session-resume usava inline (DRY).
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
