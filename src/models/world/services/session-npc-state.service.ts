import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import {
  SessionNpcPosture,
  SessionNpcStateEntity,
} from "src/entities/session-npc-state.entity";

export interface UpsertNpcStateDto {
  status?: "alive" | "dead" | "missing" | "unknown";
  disposition?: "friendly" | "neutral" | "hostile" | "indifferent";
  posture?: SessionNpcPosture;
  currentLocationId?: string | null;
  currentPoiId?: string | null;
}

export interface UpdateNpcPostureInput {
  gameSessionId: string;
  campaignId: string;
  npcId: string;
  posture: SessionNpcPosture;
  traceId?: string;
  sceneId?: string;
  triggeredBy?: "archivist_pre_commit" | "encounter_outcome_reset";
}

@Injectable()
export class SessionNpcStateService {
  constructor(
    @InjectRepository(SessionNpcStateEntity)
    private readonly repo: Repository<SessionNpcStateEntity>,
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
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
      posture: defaults.posture ?? "peaceful",
      currentLocationId: defaults.currentLocationId ?? undefined,
      currentPoiId: defaults.currentPoiId ?? undefined,
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
    if (patch.posture !== undefined) state.posture = patch.posture;
    if (patch.currentLocationId !== undefined) {
      state.currentLocationId = patch.currentLocationId ?? undefined;
    }
    if (patch.currentPoiId !== undefined) {
      state.currentPoiId = patch.currentPoiId ?? undefined;
    }
    return this.repo.save(state);
  }

  async updatePosture(
    input: UpdateNpcPostureInput,
  ): Promise<SessionNpcStateEntity> {
    let state = await this.getOrCreate(input.gameSessionId, input.npcId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const oldPosture = state.posture ?? "peaceful";
      if (oldPosture === input.posture) return state;

      const updated = await this.repo.query(
        `
        UPDATE "session_npc_state"
        SET "posture" = $3, "updated_at" = NOW()
        WHERE "id" = $1 AND "posture" = $2
        RETURNING "id"
        `,
        [state.id, oldPosture, input.posture],
      );
      if (!Array.isArray(updated) || updated.length === 0) {
        state =
          (await this.getByNpc(input.gameSessionId, input.npcId)) ??
          (await this.getOrCreate(input.gameSessionId, input.npcId));
        continue;
      }

      const saved =
        (await this.repo.findOne({ where: { id: state.id } })) ??
        this.repo.create({ ...state, posture: input.posture });
      await this.emitPostureChanged(input, oldPosture);
      return saved;
    }

    return state;
  }

  private async emitPostureChanged(
    input: UpdateNpcPostureInput,
    oldPosture: SessionNpcPosture,
  ): Promise<void> {
    const envelope = this.factory.build({
      eventCategory: "NarrativeEvent",
      eventType: "npc_posture_changed",
      source: {
        service: "diad-backend",
        module: "SessionNpcStateService.updatePosture",
        traceId: input.traceId,
      },
      scope: {
        campaignId: input.campaignId,
        sessionId: input.gameSessionId,
        ...(input.sceneId ? { sceneId: input.sceneId } : {}),
      },
      payload: {
        sessionId: input.gameSessionId,
        npcId: input.npcId,
        oldPosture,
        newPosture: input.posture,
        triggeredBy: input.triggeredBy ?? "archivist_pre_commit",
        ...(input.sceneId ? { sceneId: input.sceneId } : {}),
      },
      audiences: ["Narrator", "Director", "HUD"],
      narrativeDescriptor: `NPC ${input.npcId}: ${oldPosture} -> ${input.posture}`,
    });
    await this.eventBus.publish(envelope);
  }

  async listBySession(gameSessionId: string): Promise<SessionNpcStateEntity[]> {
    return this.repo
      .createQueryBuilder("state")
      .leftJoinAndSelect("state.npc", "npc")
      .where("state.gameSessionId = :gameSessionId", { gameSessionId })
      .getMany();
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
      relations: ["npc", "currentPoi"],
    });
  }

  async listByPoi(
    gameSessionId: string,
    poiId: string,
  ): Promise<SessionNpcStateEntity[]> {
    return this.repo.find({
      where: { gameSessionId, currentPoiId: poiId },
      relations: ["npc", "currentPoi"],
    });
  }
}
