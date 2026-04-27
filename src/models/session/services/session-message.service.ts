import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
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
]);

@Injectable()
export class SessionMessageService {
  constructor(
    @InjectRepository(SessionMessageEntity)
    private readonly messageRepo: Repository<SessionMessageEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
  ) {}

  async append(dto: AppendMessageDto): Promise<SessionMessageEntity> {
    if (!VALID_KINDS.has(dto.kind)) {
      throw new NotFoundException(`Invalid message kind: ${dto.kind}`);
    }
    await this.assertOwnership(dto.sessionId, dto.userId);

    if (dto.clientId) {
      const existing = await this.messageRepo.findOne({
        where: { sessionId: dto.sessionId, clientId: dto.clientId },
      });
      if (existing) return existing;
    }

    const sequence = await this.getNextSequence(dto.sessionId);
    const message = this.messageRepo.create({
      sessionId: dto.sessionId,
      userId: dto.userId,
      characterId: dto.characterId,
      kind: dto.kind,
      content: dto.content,
      sequenceNumber: sequence,
      clientId: dto.clientId,
    });
    return this.messageRepo.save(message);
  }

  async listBySession(
    sessionId: string,
    userId: string,
    limit = 200,
    afterSequence?: number,
  ): Promise<SessionMessageEntity[]> {
    await this.assertOwnership(sessionId, userId);
    const qb = this.messageRepo
      .createQueryBuilder("m")
      .where("m.session_id = :sessionId", { sessionId })
      .orderBy("m.sequence_number", "ASC")
      .take(limit);
    if (typeof afterSequence === "number") {
      qb.andWhere("m.sequence_number > :afterSequence", { afterSequence });
    }
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

  private async getNextSequence(sessionId: string): Promise<number> {
    const result = await this.messageRepo
      .createQueryBuilder("m")
      .select("COALESCE(MAX(m.sequence_number), 0)", "max")
      .where("m.session_id = :sessionId", { sessionId })
      .getRawOne();
    return (parseInt(result?.max ?? "0", 10) || 0) + 1;
  }
}
