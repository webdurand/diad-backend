import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  SessionMessageEntity,
  SessionMessageKind,
} from "src/entities/session-message.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";

export interface AppendMessageDto {
  sessionId: string;
  userId: string;
  characterId?: string;
  kind: SessionMessageKind;
  content: string;
  clientId?: string;
}

const VALID_KINDS: ReadonlySet<SessionMessageKind> = new Set([
  "narration",
  "player_action",
  "system",
  "recap",
  "xp",
  "rest_done",
  "morning_briefing",
  "combat_resolution",
  "dice_roll",
  "choices",
  "rewards",
  "turn_outcome",
]);

@Injectable()
export class SessionMessageService {
  constructor(
    @InjectRepository(SessionMessageEntity)
    private readonly messageRepo: Repository<SessionMessageEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly dataSource: DataSource,
  ) {}


  async append(dto: AppendMessageDto): Promise<SessionMessageEntity> {
    if (!VALID_KINDS.has(dto.kind)) {
      throw new NotFoundException(`Invalid message kind: ${dto.kind}`);
    }
    await this.assertOwnership(dto.sessionId, dto.userId);

    return this.dataSource.transaction(async (manager) => {


      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `session_msg:${dto.sessionId}`,
      ]);

      if (dto.clientId) {
        const existing = await manager.findOne(SessionMessageEntity, {
          where: { sessionId: dto.sessionId, clientId: dto.clientId },
        });
        if (existing) return existing;
      }

      const sequence = await this.computeNextSequence(manager, dto.sessionId);
      const message = manager.create(SessionMessageEntity, {
        sessionId: dto.sessionId,
        userId: dto.userId,
        characterId: dto.characterId,
        kind: dto.kind,
        content: dto.content,
        sequenceNumber: sequence,
        clientId: dto.clientId,
      });
      return manager.save(SessionMessageEntity, message);
    });
  }

  async listBySession(
    sessionId: string,
    userId: string,
    limit = 200,
    afterSequence?: number,
  ): Promise<SessionMessageEntity[]> {
    await this.assertOwnership(sessionId, userId);
    const safeLimit =
      Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), 500)
        : 200;
    const safeAfterSequence =
      typeof afterSequence === "number" && Number.isFinite(afterSequence)
        ? afterSequence
        : null;

    if (safeAfterSequence === null) {
      const recent = await this.messageRepo
        .createQueryBuilder("m")
        .where("m.session_id = :sessionId", { sessionId })
        .orderBy("m.sequence_number", "DESC")
        .take(safeLimit)
        .getMany();
      return recent.reverse();
    }

    const qb = this.messageRepo
      .createQueryBuilder("m")
      .where("m.session_id = :sessionId", { sessionId })
      .orderBy("m.sequence_number", "ASC")
      .take(safeLimit)
      .andWhere("m.sequence_number > :afterSequence", {
        afterSequence: safeAfterSequence,
      });
    return qb.getMany();
  }

  async getRecent(
    sessionId: string,
    userId: string,
    limit = 20,
  ): Promise<SessionMessageEntity[]> {
    await this.assertOwnership(sessionId, userId);
    const recent = await this.messageRepo
      .createQueryBuilder("m")
      .where("m.session_id = :sessionId", { sessionId })
      .orderBy("m.sequence_number", "DESC")
      .take(limit)
      .getMany();
    return recent.reverse();
  }

  private async assertOwnership(
    sessionId: string,
    userId: string,
  ): Promise<void> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: ["id", "ownerId"],
    });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }
    if (session.ownerId !== userId) {
      throw new ForbiddenException(
        "User não tem acesso ao histórico desta sessão.",
      );
    }
  }

  async findByClientId(
    sessionId: string,
    clientId: string,
  ): Promise<SessionMessageEntity | null> {
    return this.messageRepo.findOne({
      where: { sessionId, clientId },
    });
  }


  async getMaxSequenceNumber(sessionId: string): Promise<number> {
    const result = await this.messageRepo
      .createQueryBuilder("m")
      .select("COALESCE(MAX(m.sequence_number), 0)", "max")
      .where("m.session_id = :sessionId", { sessionId })
      .getRawOne();
    return parseInt(result?.max ?? "0", 10) || 0;
  }


  private async computeNextSequence(
    manager: EntityManager,
    sessionId: string,
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder(SessionMessageEntity, "m")
      .select("COALESCE(MAX(m.sequence_number), 0)", "max")
      .where("m.session_id = :sessionId", { sessionId })
      .getRawOne();
    const max = parseInt(result?.max ?? "0", 10) || 0;
    return max + 1;
  }
}
