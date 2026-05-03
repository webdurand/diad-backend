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
import { SseNarrationCollector } from "./sse-narration-collector";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { GameEventEntity } from "src/entities/game-event.entity";
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
  ) {}

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
  ): Promise<{ serverId: string } | null> {
    if (!narration || !narration.trim()) return null;
    const serverId = `srv-narr-${randomUUID()}`;
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
    },
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

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

      if (ctx.lastMessageMismatch) {
        res.statusCode = 409;
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            code: ErrorCode.SESSION_LAST_MESSAGE_MISMATCH,
            content:
              "Histórico desincronizado — recarregue para continuar a sessão.",
          })}\n\n`,
        );
        res.end();
        return;
      }

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

      const collector = new SseNarrationCollector();
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
        },
        res,
        (chunk) => collector.feed(chunk),
        async () => {
          const persisted = await this.persistNarration(
            sessionId,
            req.user!.id,
            collector.finalize(),
          );
          if (persisted) {
            this.emitNarrationPersisted(res, persisted.serverId, body.clientId);
          }
          await this.emitSessionSync(sessionId, res);
        },
        {
          "X-Service-Key": this.aiProxyService.getServiceKey(),
          "X-User-Id": req.user!.id,
        },
      );
    } catch (err: any) {
      this.logger.error(`Narrative turn error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    } finally {
      releaseIdempotency(idempotencyKey);
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
          );
          if (persisted) {
            this.emitNarrationPersisted(res, persisted.serverId, null);
          }
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
