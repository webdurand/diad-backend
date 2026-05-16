import { NotFoundException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BookendArtifactEntity } from "src/entities/bookend-artifact.entity";
import { BookendEventPublisherService } from "./bookend-event-publisher.service";

export interface BookendArtifactDto {
  id: string;
  gameSessionId: string;
  phaseTransitionId: string | null;
  kind: BookendArtifactEntity["kind"];
  prose: string;
  npcsReferenced: string[];
  metadata: BookendArtifactEntity["metadata"];
  skippedByUser: boolean;
  createdAt: string;
}

@Injectable()
export class BookendArtifactService {
  constructor(
    @InjectRepository(BookendArtifactEntity)
    private readonly artifactRepo: Repository<BookendArtifactEntity>,
    private readonly events: BookendEventPublisherService,
  ) {}

  async countBySession(sessionId: string): Promise<number> {
    return this.artifactRepo.count({ where: { gameSessionId: sessionId } });
  }

  async listBySession(sessionId: string): Promise<BookendArtifactDto[]> {
    const rows = await this.artifactRepo.find({
      where: { gameSessionId: sessionId },
      order: { createdAt: "ASC" },
    });
    return rows.map(toDto);
  }

  async getById(sessionId: string, id: string): Promise<BookendArtifactDto> {
    const artifact = await this.artifactRepo.findOne({
      where: { id, gameSessionId: sessionId },
    });
    if (!artifact) throw new NotFoundException("BookendArtifact não encontrado.");
    return toDto(artifact);
  }

  async markSkipped(input: {
    sessionId: string;
    id: string;
    elapsedMs: number;
    traceId?: string;
  }): Promise<BookendArtifactDto> {
    const artifact = await this.artifactRepo.findOne({
      where: { id: input.id, gameSessionId: input.sessionId },
    });
    if (!artifact) throw new NotFoundException("BookendArtifact não encontrado.");
    artifact.skippedByUser = true;
    const saved = await this.artifactRepo.save(artifact);
    await this.events.publishSkipped({
      sessionId: input.sessionId,
      bookendArtifactId: input.id,
      kind: artifact.kind,
      elapsedMs: input.elapsedMs,
      traceId: input.traceId,
    });
    return toDto(saved);
  }
}

function toDto(artifact: BookendArtifactEntity): BookendArtifactDto {
  return {
    id: artifact.id,
    gameSessionId: artifact.gameSessionId,
    phaseTransitionId: artifact.phaseTransitionId ?? null,
    kind: artifact.kind,
    prose: artifact.prose,
    npcsReferenced: artifact.npcsReferenced ?? [],
    metadata: artifact.metadata ?? {},
    skippedByUser: artifact.skippedByUser,
    createdAt: artifact.createdAt.toISOString(),
  };
}
