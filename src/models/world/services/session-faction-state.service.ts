import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SessionFactionStateEntity } from "src/entities/session-faction-state.entity";

export interface UpsertFactionStateDto {
  isKnownToParty?: boolean;
  disposition?: "friendly" | "neutral" | "hostile" | "indifferent";
  reputation?: number;
}

@Injectable()
export class SessionFactionStateService {
  constructor(
    @InjectRepository(SessionFactionStateEntity)
    private readonly repo: Repository<SessionFactionStateEntity>,
  ) {}

  async getOrCreate(
    gameSessionId: string,
    factionId: string,
  ): Promise<SessionFactionStateEntity> {
    const found = await this.repo.findOne({
      where: { gameSessionId, factionId },
    });
    if (found) return found;
    const created = this.repo.create({ gameSessionId, factionId });
    return this.repo.save(created);
  }

  async upsert(
    gameSessionId: string,
    factionId: string,
    patch: UpsertFactionStateDto,
  ): Promise<SessionFactionStateEntity> {
    const state = await this.getOrCreate(gameSessionId, factionId);
    if (patch.isKnownToParty !== undefined) {
      state.isKnownToParty = patch.isKnownToParty;
    }
    if (patch.disposition !== undefined) state.disposition = patch.disposition;
    if (patch.reputation !== undefined) state.reputation = patch.reputation;
    return this.repo.save(state);
  }

  async listBySession(
    gameSessionId: string,
  ): Promise<SessionFactionStateEntity[]> {
    return this.repo.find({ where: { gameSessionId } });
  }
}
