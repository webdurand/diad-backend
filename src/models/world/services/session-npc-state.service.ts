import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SessionNpcStateEntity } from "src/entities/session-npc-state.entity";

export interface UpsertNpcStateDto {
  status?: "alive" | "dead" | "missing" | "unknown";
  disposition?: "friendly" | "neutral" | "hostile" | "indifferent";
  currentLocationId?: string | null;
}

@Injectable()
export class SessionNpcStateService {
  constructor(
    @InjectRepository(SessionNpcStateEntity)
    private readonly repo: Repository<SessionNpcStateEntity>,
  ) {}

  async getOrCreate(
    gameSessionId: string,
    npcId: string,
    defaults: UpsertNpcStateDto = {},
  ): Promise<SessionNpcStateEntity> {
    const found = await this.repo.findOne({
      where: { gameSessionId, npcId },
    });
    if (found) return found;
    const created = this.repo.create({
      gameSessionId,
      npcId,
      status: defaults.status ?? "alive",
      disposition: defaults.disposition ?? "neutral",
      currentLocationId: defaults.currentLocationId ?? undefined,
    });
    return this.repo.save(created);
  }

  async upsert(
    gameSessionId: string,
    npcId: string,
    patch: UpsertNpcStateDto,
  ): Promise<SessionNpcStateEntity> {
    const state = await this.getOrCreate(gameSessionId, npcId);
    if (patch.status !== undefined) state.status = patch.status;
    if (patch.disposition !== undefined) state.disposition = patch.disposition;
    if (patch.currentLocationId !== undefined) {
      state.currentLocationId = patch.currentLocationId ?? undefined;
    }
    return this.repo.save(state);
  }

  async listBySession(gameSessionId: string): Promise<SessionNpcStateEntity[]> {
    return this.repo.find({ where: { gameSessionId } });
  }

  async getByNpc(
    gameSessionId: string,
    npcId: string,
  ): Promise<SessionNpcStateEntity | null> {
    return this.repo.findOne({ where: { gameSessionId, npcId } });
  }

  async listByLocation(
    gameSessionId: string,
    locationId: string,
  ): Promise<SessionNpcStateEntity[]> {
    return this.repo.find({
      where: { gameSessionId, currentLocationId: locationId },
    });
  }
}
