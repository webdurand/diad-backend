import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SceneEntity } from "src/entities/scene.entity";
import { SceneNpcEntity } from "src/entities/scene-npc.entity";
import { ArcBeat, CampaignEntity } from "src/entities/campaign.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { CampaignService } from "src/models/world/services/campaign.service";
import { SessionNpcStateService } from "src/models/world/services/session-npc-state.service";
import { SceneContextCacheService } from "./scene-context-cache.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";

export interface CreateSceneDto {
  locationId?: string;
  title?: string;
  description?: string;
  mood?: string;
  reason?: string;
  skipBudgetIncrement?: boolean;
}

const BEAT_ORDER: ArcBeat[] = [
  "YOU",
  "NEED",
  "GO",
  "SEARCH",
  "FIND",
  "TAKE",
  "RETURN",
  "CHANGE",
];

@Injectable()
export class SceneService {
  constructor(
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    @InjectRepository(SceneNpcEntity)
    private readonly sceneNpcRepo: Repository<SceneNpcEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    private readonly campaignService: CampaignService,
    private readonly contextCache: SceneContextCacheService,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly logger: DiadLogger,
    private readonly npcStateService: SessionNpcStateService,
  ) {
    this.logger.setContext(SceneService.name);
  }

  async create(sessionId: string, dto: CreateSceneDto): Promise<SceneEntity> {
    const previousActive = await this.sceneRepo.findOne({
      where: { sessionId, isActive: true },
      select: ["id", "locationId"],
    });
    if (previousActive) this.contextCache.invalidate(previousActive.id);
    await this.sceneRepo.update(
      { sessionId, isActive: true },
      { isActive: false, endedAt: new Date() },
    );

    const nextNumber = await this.getNextSceneNumber(sessionId);

    const campaign = await this.resolveCampaign(sessionId);
    let arcBeat: ArcBeat | undefined;
    if (campaign) {
      if (!dto.skipBudgetIncrement) {
        await this.campaignService.incrementCount(campaign.id, "scenes");
        arcBeat = await this.computeAndAdvanceArcBeat(campaign.id, nextNumber);
      }
    }

    const resolvedLocationId =
      dto.locationId ??
      previousActive?.locationId ??
      campaign?.startingLocationId ??
      null;

    if (!resolvedLocationId) {
      this.logger.warn("scene.created.without_location", {
        "session.id": sessionId,
        "scene.number": nextNumber,
        "campaign.id": campaign?.id ?? "(none)",
      });
    }

    const scene = this.sceneRepo.create({
      sessionId,
      sceneNumber: nextNumber,
      locationId: resolvedLocationId ?? undefined,
      title: dto.title,
      description: dto.description,
      mood: dto.mood,
      isActive: true,
      startedAt: new Date(),
      arcBeat,
    });
    const saved = await this.sceneRepo.save(scene);

    
    await this.publishSceneChanged({
      sessionId,
      campaignId: campaign?.id ?? null,
      fromSceneId: previousActive?.id ?? null,
      toSceneId: saved.id,
      sceneNumber: nextNumber,
      locationId: resolvedLocationId,
      arcBeat: arcBeat ?? null,
      reason: dto.reason ?? null,
    });

    return saved;
  }

  private async publishSceneChanged(payload: {
    sessionId: string;
    campaignId: string | null;
    fromSceneId: string | null;
    toSceneId: string;
    sceneNumber: number;
    locationId: string | null;
    arcBeat: ArcBeat | null;
    reason: string | null;
  }): Promise<void> {
    if (!payload.campaignId) return;
    try {
      const envelope = this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "scene_changed",
        source: { service: "diad-backend", module: "SceneService.create" },
        scope: {
          campaignId: payload.campaignId,
          sessionId: payload.sessionId,
          sceneId: payload.toSceneId,
        },
        audiences: ["Director", "Narrator", "HUD"],
        narrativeDescriptor: payload.fromSceneId
          ? `Cena transicionou (${payload.fromSceneId.slice(0, 8)} → ${payload.toSceneId.slice(0, 8)})`
          : `Cena ${payload.sceneNumber} iniciada`,
        payload: {
          fromSceneId: payload.fromSceneId,
          toSceneId: payload.toSceneId,
          sceneNumber: payload.sceneNumber,
          locationId: payload.locationId,
          arcBeat: payload.arcBeat,
          reason: payload.reason,
        },
      });
      await this.eventBus.publish(envelope);
    } catch (err) {
      this.logger.error("scene.changed.publish_failed", err, {
        "session.id": payload.sessionId,
        "scene.from": payload.fromSceneId ?? "(none)",
        "scene.to": payload.toSceneId,
      });
    }
  }

  async computeAndAdvanceArcBeat(
    campaignId: string,
    sceneNumber: number,
  ): Promise<ArcBeat> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException("Campanha nao encontrada.");

    const max = campaign.contentBudget.maxScenes;
    const current = campaign.arcState.currentBeat;
    let next: ArcBeat;
    let reason: string;

    if (sceneNumber === 1) {
      next = "YOU";
      reason = "first_scene";
    } else if (sceneNumber >= max) {
      next = "CHANGE";
      reason = "budget_final_scene";
    } else if (sceneNumber === max - 1) {
      next = "RETURN";
      reason = "budget_penultimate_forced_return";
    } else if (campaign.questionAnswered) {
      next = "RETURN";
      reason = "central_question_answered";
    } else {
      next = this.nextBeatLinear(current);
      reason = "linear_advance";
    }

    if (next !== current) {
      const history = [...(campaign.arcState.transitionHistory ?? [])];
      history.push({ from: current, to: next, atScene: sceneNumber, reason });
      campaign.arcState = {
        currentBeat: next,
        beatEnteredAtScene: sceneNumber,
        transitionHistory: history,
      };
      await this.campaignRepo.save(campaign);
    }
    return next;
  }

  private nextBeatLinear(current: ArcBeat): ArcBeat {
    const idx = BEAT_ORDER.indexOf(current);
    if (idx < 0 || idx >= BEAT_ORDER.length - 1) return "CHANGE";
    return BEAT_ORDER[idx + 1];
  }


  async forceArcTransition(
    campaignId: string,
    newBeat: ArcBeat,
    reason: string,
    atScene?: number,
  ): Promise<CampaignEntity> {
    if (!BEAT_ORDER.includes(newBeat)) {
      throw new NotFoundException({
        ok: false,
        error: `Arc beat inválido: ${newBeat}.`,
        code: "ARC_BEAT_INVALID",
      });
    }
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException("Campanha nao encontrada.");

    const sceneNumber = atScene ?? campaign.currentCounts.scenes;
    const current = campaign.arcState.currentBeat;
    if (current === newBeat) return campaign;

    const history = [...(campaign.arcState.transitionHistory ?? [])];
    history.push({ from: current, to: newBeat, atScene: sceneNumber, reason });
    campaign.arcState = {
      currentBeat: newBeat,
      beatEnteredAtScene: sceneNumber,
      transitionHistory: history,
    };
    return this.campaignRepo.save(campaign);
  }

 
  async finalizeSession(
    sessionId: string,
    payload: {
      summaryText?: string;
      summaryKeyFacts?: Record<string, any>;
    },
  ): Promise<GameSessionEntity> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException({
        ok: false,
        error: "Sessão não encontrada.",
        code: "SESSION_NOT_FOUND",
      });
    }
    if (payload.summaryText !== undefined)
      session.summaryText = payload.summaryText;
    if (payload.summaryKeyFacts !== undefined)
      session.summaryKeyFacts = payload.summaryKeyFacts;
    session.status = "completed";
    if (!session.endedAt) session.endedAt = new Date();
    return this.sessionRepo.save(session);
  }

  async getSession(sessionId: string): Promise<GameSessionEntity> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException({
        ok: false,
        error: "Sessão não encontrada.",
        code: "SESSION_NOT_FOUND",
      });
    }
    return session;
  }

  private async resolveCampaign(
    sessionId: string,
  ): Promise<CampaignEntity | null> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session?.campaignId) return null;
    return this.campaignRepo.findOne({ where: { id: session.campaignId } });
  }

  async getActive(sessionId: string): Promise<SceneEntity | null> {
    return this.sceneRepo.findOne({
      where: { sessionId, isActive: true },
      relations: ["location"],
    });
  }

  async update(
    sceneId: string,
    dto: Partial<CreateSceneDto>,
  ): Promise<SceneEntity> {
    const scene = await this.sceneRepo.findOne({ where: { id: sceneId } });
    if (!scene) throw new NotFoundException("Cena nao encontrada.");
    Object.assign(scene, dto);
    const saved = await this.sceneRepo.save(scene);
    this.contextCache.invalidate(sceneId);
    return saved;
  }

  async endScene(sceneId: string): Promise<void> {
    await this.sceneRepo.update(sceneId, {
      isActive: false,
      endedAt: new Date(),
    });
    this.contextCache.invalidate(sceneId);
  }

  async addNpcToScene(sceneId: string, npcId: string): Promise<SceneNpcEntity> {
    const existing = await this.sceneNpcRepo.findOne({
      where: { sceneId, npcId },
    });
    if (existing) return existing;

    const sceneNpc = this.sceneNpcRepo.create({ sceneId, npcId });
    const saved = await this.sceneNpcRepo.save(sceneNpc);
    this.contextCache.invalidate(sceneId);

    try {
      const scene = await this.sceneRepo.findOne({
        where: { id: sceneId },
        select: ["sessionId", "locationId"],
      });
      if (scene?.sessionId && scene.locationId) {
        await this.npcStateService.upsert(scene.sessionId, npcId, {
          currentLocationId: scene.locationId,
        });
      }
    } catch (err) {
      this.logger.warn("scene.addNpc.state_sync_failed", {
        "scene.id": sceneId,
        "npc.id": npcId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }

    return saved;
  }

  async removeNpcFromScene(sceneId: string, npcId: string): Promise<void> {
    await this.sceneNpcRepo.delete({ sceneId, npcId });
    this.contextCache.invalidate(sceneId);
  }

  async getSceneNpcs(sceneId: string): Promise<SceneNpcEntity[]> {
    return this.sceneNpcRepo.find({
      where: { sceneId },
      relations: ["npc"],
    });
  }

  async listBySession(sessionId: string): Promise<SceneEntity[]> {
    return this.sceneRepo.find({
      where: { sessionId },
      order: { sceneNumber: "ASC" },
    });
  }

  private async getNextSceneNumber(sessionId: string): Promise<number> {
    const result = await this.sceneRepo
      .createQueryBuilder("s")
      .select("COALESCE(MAX(s.scene_number), 0)", "max")
      .where("s.session_id = :sessionId", { sessionId })
      .getRawOne();
    return (parseInt(result.max, 10) || 0) + 1;
  }
}
