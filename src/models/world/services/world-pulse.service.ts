import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CampaignEntity,
  GameSessionEntity,
  SceneEntity,
  SessionEventEntity,
} from "src/entities";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { RandomEncounterMaterializerService } from "src/models/game-engine/services/random-encounter-materializer.service";

const PULL_THRESHOLD = 3;

export interface WorldPulseEvaluateInput {
  sessionId: string;
  traceId?: string;
}

export interface WorldPulseEvaluateResult {
  triggered: boolean;
  reason:
    | "random_encounter"
    | "session_not_found"
    | "campaign_not_found"
    | "scene_not_found"
    | "pull_inactive"
    | "poi_not_wild"
    | "cooldown";
  correlationKey?: string;
}

@Injectable()
export class WorldPulseService {
  private readonly inMemoryCooldown = new Set<string>();

  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    @InjectRepository(SessionEventEntity)
    private readonly eventRepo: Repository<SessionEventEntity>,
    private readonly randomEncounterMaterializer: RandomEncounterMaterializerService,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(WorldPulseService.name);
  }

  async evaluate(
    input: WorldPulseEvaluateInput,
  ): Promise<WorldPulseEvaluateResult> {
    const session = await this.sessionRepo.findOne({
      where: { id: input.sessionId },
    });
    if (!session?.campaignId) {
      return { triggered: false, reason: "session_not_found" };
    }
    if ((session.turnsSinceMissionProgress ?? 0) < PULL_THRESHOLD) {
      return { triggered: false, reason: "pull_inactive" };
    }

    const scene = await this.sceneRepo.findOne({
      where: { sessionId: session.id, isActive: true },
      relations: ["poi"],
    });
    if (!scene?.poiId || !scene.poi) {
      return { triggered: false, reason: "scene_not_found" };
    }
    if (scene.poi.kind !== "wild") {
      return { triggered: false, reason: "poi_not_wild" };
    }

    const pullCycleId = await this.countMissionProgressEvents(session.id);
    const correlationKey = this.buildCorrelationKey(
      session.id,
      scene.poiId,
      pullCycleId,
    );
    if (
      this.inMemoryCooldown.has(correlationKey) ||
      (await this.hasTriggered(correlationKey))
    ) {
      return { triggered: false, reason: "cooldown", correlationKey };
    }
    this.inMemoryCooldown.add(correlationKey);

    const campaign = await this.campaignRepo.findOne({
      where: { id: session.campaignId },
      select: ["id", "dmUserId"],
    });
    if (!campaign) {
      return { triggered: false, reason: "campaign_not_found", correlationKey };
    }

    await this.randomEncounterMaterializer.materialize({
      campaignId: session.campaignId,
      sessionId: session.id,
      sceneId: scene.id,
      ownerUserId: session.ownerId ?? campaign.dmUserId,
      monsterSlugs: this.pickMonsterSlugs(scene.poi.type, scene.poi.tags ?? []),
      partyAvgLevel: 1,
      partySize: Math.max(1, session.characterIds?.length ?? 1),
      difficulty: "low",
      biome: scene.poi.type,
      reasonChain: [
        "pull_active",
        "wild_poi",
        `turns_since_progress:${session.turnsSinceMissionProgress ?? 0}`,
      ],
      traceId: input.traceId,
    });

    const envelope = this.envelopeFactory.build({
      eventCategory: "WorldEvent",
      eventType: "world_pulse_random_encounter_triggered",
      source: {
        service: "diad-backend",
        module: "WorldPulseService.evaluate",
        traceId: input.traceId,
      },
      scope: {
        campaignId: session.campaignId,
        sessionId: session.id,
        sceneId: scene.id,
      },
      payload: {
        sessionId: session.id,
        currentPoiId: scene.poiId,
        pullCycleId,
        correlationKey,
        turnsSinceMissionProgress: session.turnsSinceMissionProgress ?? 0,
      },
      narrativeDescriptor: "O mundo reagiu ao silêncio em território selvagem.",
    });
    await this.eventBus.publish(envelope);

    return { triggered: true, reason: "random_encounter", correlationKey };
  }

  private async countMissionProgressEvents(sessionId: string): Promise<number> {
    return this.eventRepo.count({
      where: { sessionId, eventType: "mission_progress_advanced" },
    });
  }

  private async hasTriggered(correlationKey: string): Promise<boolean> {
    const found = await this.eventRepo
      .createQueryBuilder("event")
      .select("event.id")
      .where("event.eventType = :eventType", {
        eventType: "world_pulse_random_encounter_triggered",
      })
      .andWhere("event.eventPayload ->> 'correlationKey' = :correlationKey", {
        correlationKey,
      })
      .getOne();
    return !!found;
  }

  private buildCorrelationKey(
    sessionId: string,
    poiId: string,
    pullCycleId: number,
  ): string {
    return `${sessionId}:${poiId}:${pullCycleId}`;
  }

  private pickMonsterSlugs(_poiType: string, tags: string[]): string[] {
    const normalized = tags.join(" ").toLowerCase();
    if (normalized.includes("undead") || normalized.includes("cemet")) {
      return ["skeleton"];
    }
    if (normalized.includes("beast") || normalized.includes("forest")) {
      return ["wolf"];
    }
    return ["goblin"];
  }
}
