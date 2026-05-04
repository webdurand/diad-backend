import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SessionStoryArcStateEntity } from "src/entities/session-story-arc-state.entity";

export type StoryArcPhase = "hook" | "development" | "climax" | "resolution";

export interface UpsertStoryArcStateDto {
  currentPhase?: StoryArcPhase;
  phaseNotes?: Record<string, string>;
}

@Injectable()
export class SessionStoryArcStateService {
  constructor(
    @InjectRepository(SessionStoryArcStateEntity)
    private readonly repo: Repository<SessionStoryArcStateEntity>,
  ) {}

  async getOrCreate(
    gameSessionId: string,
    storyArcId: string,
  ): Promise<SessionStoryArcStateEntity> {
    const found = await this.repo.findOne({
      where: { gameSessionId, storyArcId },
    });
    if (found) return found;
    const created = this.repo.create({ gameSessionId, storyArcId });
    return this.repo.save(created);
  }

  async upsert(
    gameSessionId: string,
    storyArcId: string,
    patch: UpsertStoryArcStateDto,
  ): Promise<SessionStoryArcStateEntity> {
    const state = await this.getOrCreate(gameSessionId, storyArcId);
    if (patch.currentPhase !== undefined) state.currentPhase = patch.currentPhase;
    if (patch.phaseNotes !== undefined) state.phaseNotes = patch.phaseNotes;
    return this.repo.save(state);
  }

  async advancePhase(
    gameSessionId: string,
    storyArcId: string,
    nextPhase: StoryArcPhase,
  ): Promise<SessionStoryArcStateEntity> {
    return this.upsert(gameSessionId, storyArcId, { currentPhase: nextPhase });
  }

  async listBySession(
    gameSessionId: string,
  ): Promise<SessionStoryArcStateEntity[]> {
    return this.repo.find({ where: { gameSessionId } });
  }
}
