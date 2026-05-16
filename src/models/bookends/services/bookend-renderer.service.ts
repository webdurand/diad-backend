import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BookendArtifactEntity } from "src/entities/bookend-artifact.entity";
import {
  RenderBookendCeremonyUseCase,
  type RenderBookendInput,
} from "../application/render-bookend-ceremony.use-case";
import { AgentBookendGenerationService } from "./agent-bookend-generation.service";
import { BookendEventPublisherService } from "./bookend-event-publisher.service";
import { NpcStateSnapshotService } from "./npc-state-snapshot.service";

@Injectable()
export class BookendRendererService {
  constructor(
    @InjectRepository(BookendArtifactEntity)
    private readonly artifactRepo: Repository<BookendArtifactEntity>,
    private readonly snapshotService: NpcStateSnapshotService,
    private readonly generationService: AgentBookendGenerationService,
    private readonly eventPublisher: BookendEventPublisherService,
  ) {}

  execute(input: RenderBookendInput): Promise<BookendArtifactEntity> {
    const useCase = new RenderBookendCeremonyUseCase({
      artifactRepository: {
        save: async (artifact) =>
          this.artifactRepo.save(this.artifactRepo.create(artifact)),
      },
      snapshotPort: this.snapshotService,
      generationPort: this.generationService,
      eventPublisher: this.eventPublisher,
    });
    return useCase.execute(input) as Promise<BookendArtifactEntity>;
  }
}
