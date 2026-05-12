import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { Response } from "express";
import { createHash, randomUUID } from "crypto";
import { AuthGuard } from "../auth/auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import { AiProxyService } from "./ai-proxy.service";
import { SessionResumeService } from "../session/services/session-resume.service";
import { SessionRecapService } from "../session/services/session-recap.service";
import { SceneService } from "../session/services/scene.service";
import { SessionMessageService } from "../session/services/session-message.service";
import {
  SseNarrationCollector,
  type CollectedChoice,
  type CollectedDiceRoll,
  type CollectedTurnOutcome,
} from "./sse-narration-collector";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { GameEventEntity } from "src/entities/game-event.entity";
import { PendingGuardDispatchEntity } from "src/entities/pending-guard-dispatch.entity";
import { StartEncounterFromNarrativeService } from "../game-engine/services/start-encounter-from-narrative.service";
import type { AuthRequest } from "../auth/auth.types";

const SYSTEM_HINT_EVENT_MAP: Record<string, string> = {
  post_combat: "encounter_outcome_summary",
  post_fate_choice: "fate_ladder_resolved",
};

const IDEMPOTENCY_TTL_MS = 60_000;
const inFlightRequests = new Map<string, number>();

function buildIdempotencyKey(
  sessionId: string,
  lastMessageId: number | null | undefined,
  payload: string,
): string {
  const payloadHash = createHash("sha256")
    .update(payload ?? "")
    .digest("hex");
  return `${sessionId}|${lastMessageId ?? "null"}|${payloadHash}`;
}

function tryAcquireIdempotency(key: string): boolean {
  const now = Date.now();
  const expiresAt = inFlightRequests.get(key);
  if (expiresAt && expiresAt > now) {
    return false;
  }
  inFlightRequests.set(key, now + IDEMPOTENCY_TTL_MS);
  // Sweep oportunista — se o Map crescer, limpa entradas expiradas.
  if (inFlightRequests.size > 256) {
    for (const [k, exp] of inFlightRequests) {
      if (exp <= now) inFlightRequests.delete(k);
    }
  }
  return true;
}

function releaseIdempotency(key: string): void {
  inFlightRequests.delete(key);
}

/** Exposto APENAS pra testes — limpa todo o cache in-flight entre runs. */
export function __resetIdempotencyForTests(): void {
  inFlightRequests.clear();
}

@Controller("ai")
@UseGuards(AuthGuard)
export class AiProxyController {
  private readonly logger = new Logger(AiProxyController.name);

  constructor(
    private readonly aiProxyService: AiProxyService,
    private readonly resumeService: SessionResumeService,
    private readonly recapService: SessionRecapService,
    private readonly sceneService: SceneService,
    private readonly sessionMessageService: SessionMessageService,
    @InjectRepository(GameEventEntity)
    private readonly gameEventRepo: Repository<GameEventEntity>,
    @InjectRepository(PendingGuardDispatchEntity)
    private readonly pendingGuardRepo: Repository<PendingGuardDispatchEntity>,
    private readonly startEncounterFromNarrative: StartEncounterFromNarrativeService,
  ) {}

  private async findLatestEncounterId(
    sessionId: string,
    eventType: string,
  ): Promise<string | null> {
    try {
      const latest = await this.gameEventRepo.findOne({
        where: { sessionId, eventType },
        order: { sequence: "DESC" },
      });
      return latest?.encounterId ?? null;
    } catch {
      return null;
    }
  }

  private async injectSystemHintEvent(
    sessionId: string,
    systemHint: string | undefined,
    sceneContext: Record<string, any> | null | undefined,
  ): Promise<Record<string, any> | null | undefined> {
    if (!systemHint) return sceneContext;
    const eventType = SYSTEM_HINT_EVENT_MAP[systemHint];
    if (!eventType) return sceneContext;

    try {
      const latest = await this.gameEventRepo.findOne({
        where: { sessionId, eventType },
        order: { sequence: "DESC" },
      });
      if (!latest) return sceneContext;

      const enriched: Record<string, any> = { ...(sceneContext ?? {}) };
      const recent = Array.isArray(enriched.recent_events)
        ? [...enriched.recent_events]
        : [];
      recent.push({ type: eventType, payload: latest.data });
      enriched.recent_events = recent;
      this.logger.log(
        `systemHint=${systemHint} injected ${eventType} (seq=${latest.sequence}) ` +
          `into sceneContext.recent_events (count=${recent.length})`,
      );
      return enriched;
    } catch (err: any) {
      this.logger.warn(
        `injectSystemHintEvent failed (session=${sessionId}, hint=${systemHint}): ${err?.message}`,
      );
      return sceneContext;
    }
  }

  
  private async persistPlayerAction(
    sessionId: string,
    userId: string,
    content: string,
    clientId: string | undefined,
  ): Promise<void> {
    if (!content || !content.trim()) return;
    try {
      await this.sessionMessageService.append({
        sessionId,
        userId,
        kind: "player_action",
        content,
        clientId: clientId ?? `srv-act-${randomUUID()}`,
      });
    } catch (err: any) {
      this.logger.warn(
        `player_action persist failed (session=${sessionId}): ${err?.message}`,
      );
    }
  }

  private async persistNarration(
    sessionId: string,
    userId: string,
    narration: string,
    overrideClientId?: string,
  ): Promise<{ serverId: string } | null> {
    if (!narration || !narration.trim()) return null;
    const serverId = overrideClientId ?? `srv-narr-${randomUUID()}`;
    try {
      await this.sessionMessageService.append({
        sessionId,
        userId,
        kind: "narration",
        content: narration,
        clientId: serverId,
      });
      return { serverId };
    } catch (err: any) {
      this.logger.warn(
        `narration persist failed (session=${sessionId}): ${err?.message}`,
      );
      return null;
    }
  }

  /**
   * Persiste choices da última narração como SessionMessage kind='choices'.
   * Permite re-hidratar opções de ação após F5/reload — choices vivem
   * vinculadas à mensagem do Narrator. Conteúdo é JSON serializado.
   */
  private async persistChoices(
    sessionId: string,
    userId: string,
    choices: CollectedChoice[],
  ): Promise<void> {
    if (!choices || choices.length === 0) return;
    try {
      await this.sessionMessageService.append({
        sessionId,
        userId,
        kind: "choices",
        content: JSON.stringify(choices),
        clientId: `srv-choices-${randomUUID()}`,
      });
    } catch (err: any) {
      this.logger.warn(
        `choices persist failed (session=${sessionId}): ${err?.message}`,
      );
    }
  }

  /**
   * Persiste cada dice roll resolvido como SessionMessage kind='dice_roll'.
   * Sem isso, DiceRollCards somem da timeline após F5/login (eram só efêmeros
   * do stream SSE — game_events guarda dado bruto mas o resume lê
   * session_messages). Idempotência por rollId via clientId.
   */
  private async persistDiceRolls(
    sessionId: string,
    userId: string,
    diceRolls: CollectedDiceRoll[],
  ): Promise<void> {
    if (!diceRolls || diceRolls.length === 0) return;
    for (const roll of diceRolls) {
      try {
        await this.sessionMessageService.append({
          sessionId,
          userId,
          kind: "dice_roll",
          content: JSON.stringify(roll),
          clientId: `srv-dice-${roll.rollId}`,
        });
      } catch (err: any) {
        this.logger.warn(
          `dice_roll persist failed (session=${sessionId}, roll=${roll.rollId}): ${err?.message}`,
        );
      }
    }
  }

  /**
   * Persiste canon beats do turno como SessionMessage kind='turn_outcome'.
   * Importante: toast/SSE é efêmero; a timeline precisa sobreviver a reload.
   */
  private async persistTurnOutcomes(
    sessionId: string,
    userId: string,
    outcomes: CollectedTurnOutcome[],
  ): Promise<void> {
    if (!outcomes || outcomes.length === 0) return;
    for (const [index, outcome] of outcomes.entries()) {
      try {
        await this.sessionMessageService.append({
          sessionId,
          userId,
          kind: "turn_outcome",
          content: JSON.stringify(outcome),
          clientId: `srv-outcome-${createHash("sha256")
            .update(`${sessionId}:${outcome.createdAt}:${outcome.outcomeType}:${outcome.title}:${index}`)
            .digest("hex")
            .slice(0, 32)}`,
        });
      } catch (err: any) {
        this.logger.warn(
          `turn_outcome persist failed (session=${sessionId}, type=${outcome.outcomeType}): ${err?.message}`,
        );
      }
    }
  }

  private emitNarrationPersisted(
    res: Response,
    serverId: string,
    clientTempId: string | null | undefined,
  ): void {
    try {
      res.write(
        `data: ${JSON.stringify({
          type: "narration_persisted",
          serverId,
          clientTempId: clientTempId ?? null,
        })}\n\n`,
      );
    } catch (err: any) {
      this.logger.warn(
        `narration_persisted emit failed: ${err?.message}`,
      );
    }
  }

  private async emitSessionSync(
    sessionId: string,
    res: Response,
  ): Promise<void> {
    try {
      const lastSequenceNumber =
        await this.sessionMessageService.getMaxSequenceNumber(sessionId);
      res.write(
        `data: ${JSON.stringify({
          type: "session_sync",
          lastSequenceNumber,
        })}\n\n`,
      );
    } catch (err: any) {
      this.logger.warn(
        `session_sync emit failed (session=${sessionId}): ${err?.message}`,
      );
    }
  }

  private async tryMaterializeGuardArrival(args: {
    sessionId: string;
    campaignId: string;
    userId: string;
    traceId?: string;
  }): Promise<{
    encounterId: string;
    participantIds: string[];
    guardCount: number;
    dispatchReason?: string | null;
  } | null> {
    const currentMaxSeq =
      await this.sessionMessageService.getMaxSequenceNumber(args.sessionId);

    const pending = await this.pendingGuardRepo
      .createQueryBuilder("p")
      .where("p.sessionId = :sessionId", { sessionId: args.sessionId })
      .andWhere("p.status = 'pending'")
      .andWhere("p.targetSequence <= :seq", { seq: currentMaxSeq })
      .orderBy("p.targetSequence", "ASC")
      .limit(1)
      .getOne();

    if (!pending) return null;

    const activeScene = await this.sceneService
      .getActive(args.sessionId)
      .catch(() => null);
    if (!activeScene) {
      await this.pendingGuardRepo.update(
        { id: pending.id },
        { status: "expired" },
      );
      return null;
    }

    if (
      activeScene.locationId &&
      pending.locationId &&
      activeScene.locationId !== pending.locationId
    ) {
      await this.pendingGuardRepo.update(
        { id: pending.id },
        { status: "expired" },
      );
      this.logger.log(
        `guard arrival expired (PC moved): session=${args.sessionId} pending=${pending.id}`,
      );
      return null;
    }

    try {
      const result = await this.startEncounterFromNarrative.run({
        sessionId: args.sessionId,
        sceneId: activeScene.id,
        targetNpcIds: pending.guardNpcIds,
        surpriseRound: false,
        autoPlaceTokens: true,
        narrativeTrigger: "crime_response_arrival",
        campaignId: args.campaignId,
        ownerUserId: args.userId,
        traceId: args.traceId,
      });

      await this.pendingGuardRepo.update(
        { id: pending.id },
        {
          status: "materialized",
          materializedAt: new Date(),
          materializedEncounterId: result.encounterId,
        },
      );

      return {
        encounterId: result.encounterId,
        participantIds: result.participantIds,
        guardCount: pending.guardNpcIds.length,
        dispatchReason: pending.dispatchReason,
      };
    } catch (err: any) {
      this.logger.warn(
        `guard arrival materialize failed (session=${args.sessionId}): ${err?.message}`,
      );
      return null;
    }
  }

  private async persistSystemNarration(
    sessionId: string,
    userId: string,
    content: string,
  ): Promise<{ serverId: string } | null> {
    if (!content.trim()) return null;
    const serverId = `srv-sys-${randomUUID()}`;
    try {
      await this.sessionMessageService.append({
        sessionId,
        userId,
        kind: "system",
        content,
        clientId: serverId,
      });
      return { serverId };
    } catch (err: any) {
      this.logger.warn(
        `system narration persist failed (session=${sessionId}): ${err?.message}`,
      );
      return null;
    }
  }

  // ────── Assistente D&D ──────

  @Post("assistant/message")
  async assistantMessage(
    @Body() body: { message: string; sessionId?: string },
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      await this.aiProxyService.pipeStream(
        "/assistant/message",
        {
          message: body.message,
          session_id: body.sessionId,
          user_id: req.user!.id,
        },
        res,
      );
    } catch (err: any) {
      this.logger.error(`Assistant proxy error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }

  @Get("assistant/history")
  async assistantHistory(@Req() req: AuthRequest) {
    return this.aiProxyService.requestAgent(
      "GET",
      `/assistant/history?user_id=${req.user!.id}`,
    );
  }

  // ────── Solo Play ──────

  @Post("solo/create")
  async soloCreate(
    @Body()
    body: {
      characterId: string;
      tone: string;
      difficulty: string;
      type: string;
    },
    @Req() req: AuthRequest,
  ) {
    return this.aiProxyService.requestAgent("POST", "/solo/create", {
      character_id: body.characterId,
      tone: body.tone,
      difficulty: body.difficulty,
      type: body.type,
      user_id: req.user!.id,
    });
  }

  // ────── Multi-agent narrative pipeline (Spec 014/026 Pillar 4) ──────

  @Post("narrative/:sessionId/turn")
  async narrativeTurn(
    @Param("sessionId") sessionId: string,
    @Body()
    body: {
      playerInput: string;
      lastMessageId?: number | null;
      clientId?: string;
      voiceProfile?: string;
      // Spec 027 (M1, AC1.10) — hint do quick-action button. Quando válido,
      // IntentClassifier (Camada 1 / Brain) bypassa o Haiku (latência 0ms).
      // Campo opcional, validado no agents (`VALID_INTENTS` enum).
      intent?: string;
      // Spec 027 (M2 follow-up) — hint sistêmico (não-player) pro Narrator.
      // Hoje único valor: 'post_combat' — sinaliza que o turn anterior foi
      // o fim de um encounter; Narrator deve fechar o arco diegeticamente
      // usando session_events recentes (encounter_ended, xp_awarded, etc).
      systemHint?: string;
      restEventKind?: string;
    },
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const tStart = performance.now();
    let tAgentsCallStart = 0;
    let tPostPersistStart = 0;
    let tPostPersistEnd = 0;
    let earlyReturnReason: string | null = null;

    // Spec 027 (M1, AC1.12) — guard in-flight contra duplo-POST do mesmo
    // turn (jogador clicando rápido). Chave inclui lastMessageId pra que
    // turns sequenciais legítimos não colidam.
    const idempotencyKey = buildIdempotencyKey(
      sessionId,
      body.lastMessageId,
      body.playerInput ?? "",
    );
    if (!tryAcquireIdempotency(idempotencyKey)) {
      res.statusCode = 409;
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          code: ErrorCode.IDEMPOTENCY_CACHE_MISS_AFTER_RACE,
          content:
            "Outro turn idêntico já está em processamento — aguarde a resposta antes de tentar de novo.",
        })}\n\n`,
      );
      res.end();
      return;
    }

    try {
      const ctx = await this.resumeService.assemble(sessionId, {
        lastMessageIdFromClient: body.lastMessageId ?? null,
      });

      res.setHeader(
        "X-Session-Resume-Hot-Recap",
        ctx.hotRecapTriggered
          ? "pending"
          : ctx.previousSessionSummary
          ? "cached"
          : "none",
      );
      res.setHeader(
        "X-Session-Is-Resumed",
        ctx.isResumed ? "true" : "false",
      );

      if (ctx.lastMessageMismatch) {
        // Cliente ficou para trás (stream truncado, aba inativa durante a
        // narração, refresh durante turn). Server é fonte da verdade — em
        // vez de 409, emitimos session_sync upfront pro front se atualizar
        // e seguimos o turn normalmente. Mismatch só ocorre quando cliente
        // está atrás (detectMismatch retorna true só para serverSeq - clientSeq > 1),
        // e isso é sempre recuperável.
        this.logger.warn("session.last_message_mismatch_recovered", {
          "session.id": sessionId,
          "client.lastMessageId": body.lastMessageId ?? null,
          "server.lastMessageId": ctx.serverLastMessageId,
        });
        await this.emitSessionSync(sessionId, res);
      }

      await this.persistPlayerAction(
        sessionId,
        req.user!.id,
        body.playerInput,
        body.clientId,
      );

      // Sync antecipado: emite `session_sync` logo após persistir o
      // `player_action` (server +1). Sem isso, se o stream cair entre
      // `persistNarration` (server +2) e o `emitSessionSync` final, o ref do
      // front fica defasado em 2 e o próximo turn cai em 409
      // SESSION_LAST_MESSAGE_MISMATCH. Com o sync precoce, mesmo stream
      // truncado deixa o ref no máximo 1 atrás (tolerado pelo detectMismatch).
      await this.emitSessionSync(sessionId, res);

      const guardArrival = ctx.campaignId
        ? await this.tryMaterializeGuardArrival({
            sessionId,
            campaignId: ctx.campaignId,
            userId: req.user!.id,
          })
        : null;

      if (guardArrival) {
        const arrivalNote =
          guardArrival.guardCount === 1
            ? "Um guarda chega ao local."
            : `${guardArrival.guardCount} guardas chegam ao local.`;
        await this.persistSystemNarration(
          sessionId,
          req.user!.id,
          `${arrivalNote} Eles te identificam — combate iminente.`,
        );

        res.write(
          `data: ${JSON.stringify({
            type: "combat_starting",
            encounterId: guardArrival.encounterId,
            participantIds: guardArrival.participantIds,
            surprise: false,
            trigger: "crime_response_arrival",
            dispatchReason: guardArrival.dispatchReason,
          })}\n\n`,
        );

        await this.emitSessionSync(sessionId, res);
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
        return;
      }

      // Spec 026 Pillar 4 — `SceneContext` (Spec 018) não carrega `sceneId`
      // no top-level (só `scene.{title,description,mood,location}`). O
      // Coordinator agents precisa do sceneId pra dispatch
      // start_encounter_from_narrative — sem ele, encounter dispatch retorna
      // None silenciosamente. Injetamos via `sceneService.getActive()`.
      const activeScene = await this.sceneService
        .getActive(sessionId)
        .catch(() => null);
      let sceneContextForAgent = activeScene
        ? { ...(ctx.sceneContext ?? {}), sceneId: activeScene.id }
        : ctx.sceneContext;

      // Spec 027 (M2 follow-up) — quando systemHint mapeia pra um evento
      // estruturado em `game_events`, injetamos esse evento em
      // `sceneContext.recent_events` pro Coordinator (post_combat /
      // post_fate_choice) ler outcome + dados do PC.
      sceneContextForAgent = (await this.injectSystemHintEvent(
        sessionId,
        body.systemHint,
        sceneContextForAgent as Record<string, any> | null | undefined,
      )) as typeof sceneContextForAgent;

      // Idempotência F5 — para `systemHint='post_combat'`, a narração é
      // persistida com clientId determinístico por encounterId. Se já existe,
      // não chamamos o agent — apenas re-emitimos `narration_persisted` (com
      // o serverId existente) e `session_sync`. Cobre F5 mesmo quando o
      // `lastMessageId` no payload mudou (idempotency global por hash falha
      // nesse caso porque o key inclui lastMessageId).
      const postCombatEncounterId =
        body.systemHint === "post_combat"
          ? await this.findLatestEncounterId(sessionId, "encounter_resolved")
          : null;
      const postCombatClientId = postCombatEncounterId
        ? `srv-narr-post-combat-${postCombatEncounterId}`
        : undefined;
      if (postCombatClientId) {
        const existing = await this.sessionMessageService.findByClientId(
          sessionId,
          postCombatClientId,
        );
        if (existing) {
          this.emitNarrationPersisted(res, existing.clientId ?? postCombatClientId, body.clientId);
          await this.emitSessionSync(sessionId, res);
          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
          res.end();
          return;
        }
      }

      const collector = new SseNarrationCollector();
      const narrationClientId = postCombatClientId ?? `srv-narr-${randomUUID()}`;
      let earlyPersistFired = false;
      collector.onNarratorDone(async (narration) => {
        if (earlyPersistFired) return;
        earlyPersistFired = true;
        const persisted = await this.persistNarration(
          sessionId,
          req.user!.id,
          narration,
          narrationClientId,
        );
        if (persisted) {
          this.emitNarrationPersisted(res, persisted.serverId, body.clientId);
        }
      });
      tAgentsCallStart = performance.now();
      await this.aiProxyService.pipeStream(
        "/narrative/turn",
        {
          campaignId: ctx.campaignId,
          sessionId,
          playerInput: body.playerInput,
          voiceProfile: body.voiceProfile,
          isResumed: ctx.isResumed,
          previousSessionId: ctx.previousSessionId,
          sceneContext: sceneContextForAgent,
          recentMessages: ctx.recentMessages,
          previousSessionSummary: ctx.previousSessionSummary,
          gapMinutes: ctx.gapMinutes,
          // Spec 027 (M1, AC1.10) — forward do intent hint pro IntentClassifier
          // bypassar o Haiku quando o input vem de quick-action button.
          ...(body.intent ? { intent: body.intent } : {}),
          // Spec 027 (M2 follow-up) — forward do systemHint pro Narrator
          // ('post_combat' | 'post_fate_choice' = closure narrativa estruturada).
          ...(body.systemHint ? { systemHint: body.systemHint } : {}),
          ...(body.restEventKind ? { restEventKind: body.restEventKind } : {}),
        },
        res,
        (chunk) => collector.feed(chunk),
        async () => {
          tPostPersistStart = performance.now();
          const persisted = await this.persistNarration(
            sessionId,
            req.user!.id,
            collector.finalize(),
            narrationClientId,
          );
          if (persisted && !earlyPersistFired) {
            this.emitNarrationPersisted(res, persisted.serverId, body.clientId);
          }
          await this.persistChoices(
            sessionId,
            req.user!.id,
            collector.getChoices(),
          );
          await this.persistDiceRolls(
            sessionId,
            req.user!.id,
            collector.getDiceRolls(),
          );
          await this.persistTurnOutcomes(
            sessionId,
            req.user!.id,
            collector.getTurnOutcomes(),
          );
          await this.emitSessionSync(sessionId, res);
          tPostPersistEnd = performance.now();
        },
        {
          "X-Service-Key": this.aiProxyService.getServiceKey(),
          "X-User-Id": req.user!.id,
        },
      );
    } catch (err: any) {
      earlyReturnReason = `error:${err?.name ?? "unknown"}`;
      this.logger.error(`Narrative turn error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    } finally {
      releaseIdempotency(idempotencyKey);
      const tEnd = performance.now();
      const prePersistMs = tAgentsCallStart > 0 ? Math.round(tAgentsCallStart - tStart) : null;
      const agentsCallMs =
        tAgentsCallStart > 0 && tPostPersistStart > 0
          ? Math.round(tPostPersistStart - tAgentsCallStart)
          : null;
      const postPersistMs =
        tPostPersistStart > 0 && tPostPersistEnd > 0
          ? Math.round(tPostPersistEnd - tPostPersistStart)
          : null;
      const totalMs = Math.round(tEnd - tStart);
      this.logger.log(
        `ai.narrative_turn.streamtrace session=${sessionId} ` +
          `total_ms=${totalMs} ` +
          `pre_persist_ms=${prePersistMs ?? "null"} ` +
          `agents_call_ms=${agentsCallMs ?? "null"} ` +
          `post_persist_ms=${postPersistMs ?? "null"}` +
          (earlyReturnReason ? ` early_return=${earlyReturnReason}` : ""),
      );
    }
  }

  /**
   * Abertura de sessão via pipeline multi-agent. Mesmo pipeline do
   * `/ai/narrative/:sessionId/turn` mas com `playerInput=null` — Director
   * resolve via forcing rule "scene 1 → YOU beat".
   */
  @Post("narrative/:sessionId/start")
  async narrativeStart(
    @Param("sessionId") sessionId: string,
    @Body() body: { voiceProfile?: string },
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Spec 027 (M1, AC1.12) — guard in-flight idêntico ao narrativeTurn.
    // Sem playerInput o payload é sempre vazio; chave usa só sessionId +
    // marker fixo "narrative-start" pra rejeitar duplo-POST de abertura.
    const idempotencyKey = buildIdempotencyKey(
      sessionId,
      null,
      "narrative-start",
    );
    if (!tryAcquireIdempotency(idempotencyKey)) {
      res.statusCode = 409;
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          code: ErrorCode.IDEMPOTENCY_CACHE_MISS_AFTER_RACE,
          content:
            "A abertura desta sessão já está em processamento — aguarde a primeira resposta.",
        })}\n\n`,
      );
      res.end();
      return;
    }

    try {
      const ctx = await this.resumeService.assemble(sessionId);

      const activeScene = await this.sceneService
        .getActive(sessionId)
        .catch(() => null);
      const sceneContextForAgent = activeScene
        ? { ...(ctx.sceneContext ?? {}), sceneId: activeScene.id }
        : ctx.sceneContext;

      const collector = new SseNarrationCollector();
      const narrationClientId = `srv-narr-${randomUUID()}`;
      let earlyPersistFired = false;
      collector.onNarratorDone(async (narration) => {
        if (earlyPersistFired) return;
        earlyPersistFired = true;
        const persisted = await this.persistNarration(
          sessionId,
          req.user!.id,
          narration,
          narrationClientId,
        );
        if (persisted) {
          this.emitNarrationPersisted(res, persisted.serverId, null);
        }
      });
      await this.aiProxyService.pipeStream(
        "/narrative/turn",
        {
          campaignId: ctx.campaignId,
          sessionId,
          playerInput: null,
          voiceProfile: body.voiceProfile,
          isResumed: ctx.isResumed,
          previousSessionId: ctx.previousSessionId,
          sceneContext: sceneContextForAgent,
          recentMessages: ctx.recentMessages,
          previousSessionSummary: ctx.previousSessionSummary,
          gapMinutes: ctx.gapMinutes,
        },
        res,
        (chunk) => collector.feed(chunk),
        async () => {
          const persisted = await this.persistNarration(
            sessionId,
            req.user!.id,
            collector.finalize(),
            narrationClientId,
          );
          if (persisted && !earlyPersistFired) {
            this.emitNarrationPersisted(res, persisted.serverId, null);
          }
          await this.persistChoices(
            sessionId,
            req.user!.id,
            collector.getChoices(),
          );
          await this.persistDiceRolls(
            sessionId,
            req.user!.id,
            collector.getDiceRolls(),
          );
          await this.persistTurnOutcomes(
            sessionId,
            req.user!.id,
            collector.getTurnOutcomes(),
          );
          await this.emitSessionSync(sessionId, res);
        },
        {
          "X-Service-Key": this.aiProxyService.getServiceKey(),
          "X-User-Id": req.user!.id,
        },
      );
    } catch (err: any) {
      this.logger.error(`Narrative start error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    } finally {
      releaseIdempotency(idempotencyKey);
    }
  }

  @Get("solo/:sessionId/state")
  async soloState(@Param("sessionId") sessionId: string) {
    return this.aiProxyService.requestAgent("GET", `/solo/${sessionId}/state`);
  }

  @Post("solo/:sessionId/end")
  async soloEnd(
    @Param("sessionId") sessionId: string,
    @Req() _req: AuthRequest,
  ) {
    // Backend-authoritative — orquestra recap + finalize localmente.
    // ensureRecap chama /internal/summarize no agents (com lock advisory pra
    // evitar duplo-trabalho concorrente). finalizeSession persiste summary +
    // marca status=completed + endedAt. Idempotente.
    const recap = await this.recapService.ensureRecap(sessionId);
    let summaryText = "";
    if (recap.status === "cached" || recap.status === "generated") {
      summaryText = recap.summaryText;
    }

    const session = await this.sceneService.finalizeSession(sessionId, {
      summaryText: summaryText || undefined,
    });

    return {
      sessionId,
      summary: session.summaryText ?? "",
      summaryKeyFacts: session.summaryKeyFacts ?? null,
      status: session.status,
      endedAt: session.endedAt,
      recapStatus: recap.status,
    };
  }

  // ────── Admin: Knowledge Management ──────

  @Post("admin/knowledge/upload")
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor("file"))
  async uploadKnowledge(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error("Nenhum arquivo recebido.");
    }

    this.logger.log(
      `Upload knowledge: ${file.originalname} (${file.size} bytes)`,
    );

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(file.buffer)]),
      file.originalname,
    );

    const agentUrl = `${this.aiProxyService.getAgentBaseUrl()}/admin/knowledge/upload-file`;
    const response = await fetch(agentUrl, { method: "POST", body: formData });
    if (!response.ok) {
      const error = await response.text().catch(() => "Upload failed");
      this.logger.error(`Agent upload failed: ${error}`);
      throw new Error(`Falha no upload: ${error}`);
    }
    return response.json();
  }

  @Get("admin/knowledge")
  @UseGuards(AdminGuard)
  async listKnowledge() {
    try {
      return await this.aiProxyService.requestAgent(
        "GET",
        "/admin/knowledge/documents",
      );
    } catch {
      return { documents: [], total: 0 };
    }
  }

  @Post("admin/knowledge/:id/cancel")
  @UseGuards(AdminGuard)
  async cancelKnowledge(@Param("id") id: string) {
    return this.aiProxyService.requestAgent(
      "POST",
      `/admin/knowledge/doc/${id}/cancel`,
    );
  }

  @Delete("admin/knowledge/:id")
  @UseGuards(AdminGuard)
  async deleteKnowledge(@Param("id") id: string) {
    return this.aiProxyService.requestAgent(
      "DELETE",
      `/admin/knowledge/doc/${id}`,
    );
  }

  @Post("admin/knowledge/rebuild")
  @UseGuards(AdminGuard)
  async rebuildKnowledge() {
    return this.aiProxyService.requestAgent("POST", "/admin/knowledge/rebuild");
  }
}
