import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { SessionMessageEntity } from "src/entities/session-message.entity";
import { SceneService } from "./scene.service";
import { SceneContext, SceneContextService } from "./scene-context.service";
import { SessionRecapService } from "./session-recap.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";

const RESUME_GAP_THRESHOLD_MS = 5 * 60 * 1000; // 5min — spec 024 §C1
const RECENT_MESSAGES_LIMIT = 8;
const RECENT_MESSAGES_CONTENT_CAP = 2000;

export interface RecentMessageDto {
  role: "user" | "assistant" | "system";
  content: string;
  sequenceNumber: number;
  kind?: string | null;
}

export interface AssembledTurnContext {
  sessionId: string;
  campaignId: string | null;
  isResumed: boolean;
  gapMinutes: number;
  previousSessionId: string | null;
  sceneContext: SceneContext | null;
  activeSceneId: string | null;
  recentMessages: RecentMessageDto[];
  previousSessionSummary: string | null;
  hotRecapTriggered: boolean;
  lastMessageMismatch: boolean;
  /** maior `sequenceNumber` já persistido para a session — comparar ao `lastMessageId` do front. */
  serverLastMessageId: number;
}

/**
 * Spec 024 — Monta o payload enriquecido pro turn de retomada.
 *
 * Detecção de retomada server-side: gap (`now - lastTurnAt`) > 5min
 * conta como `isResumed=true`. Cobre cross-device também (sem depender
 * de flag do cliente).
 *
 * Hot-recap async (fire-and-forget): quando `previousSession.summaryText`
 * é NULL e há ≥10 messages, dispara `SessionRecapService.ensureRecap`
 * em paralelo. Primeiro turn da retomada usa só recent messages + scene
 * context (suficiente). Segundo turn em diante já tem recap cacheado.
 *
 * Princípio X v1.4.0 — emite `NarrativeEvent.session_resumed` quando
 * detecta retomada (audiences resolved Director/HUD).
 */
@Injectable()
export class SessionResumeService {
  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(SessionMessageEntity)
    private readonly messageRepo: Repository<SessionMessageEntity>,
    private readonly sceneService: SceneService,
    private readonly sceneContextService: SceneContextService,
    private readonly recapService: SessionRecapService,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(SessionResumeService.name);
  }

  async assemble(
    sessionId: string,
    options: { lastMessageIdFromClient?: number | null } = {},
  ): Promise<AssembledTurnContext> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: ["id", "campaignId", "updatedAt"],
    });
    if (!session) {
      return this.emptyContext(sessionId);
    }

    const lastMessage = await this.messageRepo
      .createQueryBuilder("m")
      .where("m.session_id = :sessionId", { sessionId })
      .orderBy("m.sequence_number", "DESC")
      .limit(1)
      .getOne();

    const serverLastMessageId = lastMessage?.sequenceNumber ?? 0;
    const lastTurnAt = lastMessage?.createdAt ?? session.updatedAt;
    const gapMs = Date.now() - new Date(lastTurnAt).getTime();
    const isResumed = gapMs > RESUME_GAP_THRESHOLD_MS;
    const gapMinutes = Math.max(0, Math.round(gapMs / 60_000));

    const lastMessageMismatch = this.detectMismatch(
      options.lastMessageIdFromClient,
      serverLastMessageId,
    );

    const previousSessionIdPromise = this.lookupPreviousSession(
      session.campaignId,
      session.id,
    );

    const previousSessionPromise = previousSessionIdPromise.then(
      (previousSessionId) =>
        previousSessionId
          ? this.sessionRepo.findOne({
              where: { id: previousSessionId },
              select: ["id", "summaryText"],
            })
          : null,
    );

    const sceneSnapshotPromise = this.assembleSceneSnapshot(sessionId);
    const recentMessagesPromise = this.loadRecentMessages(sessionId);

    const [
      previousSessionId,
      previousSession,
      sceneSnapshot,
      recentMessages,
    ] = await Promise.all([
      previousSessionIdPromise,
      previousSessionPromise,
      sceneSnapshotPromise,
      recentMessagesPromise,
    ]);

    const previousSessionSummary: string | null =
      previousSession?.summaryText ?? null;

    let hotRecapTriggered = false;
    if (
      isResumed &&
      previousSessionId &&
      (!previousSessionSummary || previousSessionSummary.length === 0)
    ) {
      hotRecapTriggered = true;
      // Fire-and-forget — não bloqueia primeiro turn (spec 024 §C3).
      void this.recapService.ensureRecap(previousSessionId).catch((err) =>
        this.logger.error("session.recap.fire_and_forget_failed", err, {
          "session.id": previousSessionId,
        }),
      );
    }

    if (isResumed && !lastMessageMismatch) {
      void this.publishSessionResumed({
        campaignId: session.campaignId ?? "",
        sessionId,
        previousSessionId,
        gapMinutes,
        hotRecapTriggered,
      });
    }

    return {
      sessionId,
      campaignId: session.campaignId ?? null,
      isResumed,
      gapMinutes,
      previousSessionId,
      sceneContext: sceneSnapshot.sceneContext,
      activeSceneId: sceneSnapshot.activeSceneId,
      recentMessages,
      previousSessionSummary,
      hotRecapTriggered,
      lastMessageMismatch,
      serverLastMessageId,
    };
  }

  private detectMismatch(
    fromClient: number | null | undefined,
    fromServer: number,
  ): boolean {
    if (fromClient === null || fromClient === undefined) return false;
    // Cliente com lastMessageId menor que server por > 1 → state drift.
    // Diferença de 1 é tolerada (race entre append e response normal).
    return fromServer - fromClient > 1;
  }

  private async lookupPreviousSession(
    campaignId: string | undefined,
    currentSessionId: string,
  ): Promise<string | null> {
    if (!campaignId) return null;
    const previous = await this.sessionRepo
      .createQueryBuilder("s")
      .where("s.campaign_id = :campaignId", { campaignId })
      .andWhere("s.id != :currentSessionId", { currentSessionId })
      .andWhere("s.status IN (:...statuses)", {
        statuses: ["completed", "paused"],
      })
      .orderBy("COALESCE(s.ended_at, s.updated_at)", "DESC")
      .limit(1)
      .getOne();
    return previous?.id ?? null;
  }

  private async assembleSceneSnapshot(
    sessionId: string,
  ): Promise<{
    sceneContext: SceneContext | null;
    activeSceneId: string | null;
  }> {
    try {
      const scene = await this.sceneService.getActive(sessionId);
      if (!scene) return { sceneContext: null, activeSceneId: null };
      const sceneContext = await this.sceneContextService.assembleContext(
        scene.id,
      );
      return { sceneContext, activeSceneId: scene.id };
    } catch (err) {
      this.logger.warn("session.resume.scene_context_failed", {
        "session.id": sessionId,
        "error.type": err instanceof Error ? err.name : "unknown",
      });
      return { sceneContext: null, activeSceneId: null };
    }
  }

  private async loadRecentMessages(
    sessionId: string,
  ): Promise<RecentMessageDto[]> {
    const rows = await this.messageRepo
      .createQueryBuilder("m")
      .where("m.session_id = :sessionId", { sessionId })
      .orderBy("m.sequence_number", "DESC")
      .take(RECENT_MESSAGES_LIMIT)
      .getMany();
    rows.reverse();
    return rows.map((m) => ({
      role: this.mapRole(m.kind),
      content: this.cap(m.content ?? "", RECENT_MESSAGES_CONTENT_CAP),
      sequenceNumber: m.sequenceNumber,
      kind: m.kind,
    }));
  }

  private mapRole(kind: string): "user" | "assistant" | "system" {
    if (kind === "player_action") return "user";
    if (kind === "narration" || kind === "combat_resolution")
      return "assistant";
    return "system";
  }

  private cap(s: string, max: number): string {
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
  }

  private async publishSessionResumed(payload: {
    campaignId: string;
    sessionId: string;
    previousSessionId: string | null;
    gapMinutes: number;
    hotRecapTriggered: boolean;
  }): Promise<void> {
    if (!payload.campaignId) return;
    try {
      const envelope = this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "session_resumed",
        source: { service: "diad-backend", module: "session-resume" },
        scope: {
          campaignId: payload.campaignId,
          sessionId: payload.sessionId,
        },
        audiences: ["Director", "HUD"],
        narrativeDescriptor: "Jogador retomou a sessão.",
        payload: {
          previousSessionId: payload.previousSessionId,
          gapMinutes: payload.gapMinutes,
          hotRecapTriggered: payload.hotRecapTriggered,
          deviceChanged: false,
        },
      });
      await this.eventBus.publish(envelope);
    } catch (err) {
      this.logger.error("session.resumed.publish_failed", err, {
        "session.id": payload.sessionId,
      });
    }
  }

  private emptyContext(sessionId: string): AssembledTurnContext {
    return {
      sessionId,
      campaignId: null,
      isResumed: false,
      gapMinutes: 0,
      previousSessionId: null,
      sceneContext: null,
      activeSceneId: null,
      recentMessages: [],
      previousSessionSummary: null,
      hotRecapTriggered: false,
      lastMessageMismatch: false,
      serverLastMessageId: 0,
    };
  }
}
