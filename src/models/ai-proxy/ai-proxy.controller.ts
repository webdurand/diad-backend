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
import type { AuthRequest } from "../auth/auth.types";

/**
 * Spec 027 (M1, AC1.12) — guard in-flight pra evitar dois POST idênticos
 * em paralelo (jogador clica 2× rápido demais antes do `persistPlayerAction`
 * gravar a primeira). Não é cache de resposta — é apenas um Set de chaves
 * sob TTL curto (60s) que rejeita o duplicado com 409
 * IDEMPOTENCY_CACHE_MISS_AFTER_RACE.
 *
 * In-memory simples — DIAD não tem Redis. Em multi-replica, a colisão real
 * que importa (mesma sessão batendo no mesmo replica em ms) ainda é
 * mitigada pelo advisory lock no `getNextSequence`; este guard cobre o
 * caso single-replica + click duplo do user.
 */
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
  ) {}

  /**
   * Persiste input do user (`player_action`) ANTES do pipeStream pra garantir
   * que o turno fica registrado mesmo se o agents falhar mid-stream. Idempotente
   * via `clientId` — frontend usa `entry-N`, backend usa `srv-act-*`.
   */
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

  /**
   * Persiste narração final (`narration`) DEPOIS do pipeStream finalizar.
   * Bloqueante (await) — o stream já foi entregue ao client via `res.end()`
   * interno do pipeStream; aguardar aqui só atrasa a Promise do controller,
   * garantindo que `GET /sessions/:id/messages` logo em seguida veja a
   * narração nova. Tolera erro pra não derrubar o request.
   */
  private async persistNarration(
    sessionId: string,
    userId: string,
    narration: string,
  ): Promise<void> {
    if (!narration || !narration.trim()) return;
    try {
      await this.sessionMessageService.append({
        sessionId,
        userId,
        kind: "narration",
        content: narration,
        clientId: `srv-narr-${randomUUID()}`,
      });
    } catch (err: any) {
      this.logger.warn(
        `narration persist failed (session=${sessionId}): ${err?.message}`,
      );
    }
  }

  /**
   * Spec 024 follow-up — emite chunk SSE `session_sync` com o `lastSequenceNumber`
   * server-authoritative ao final do stream. Frontend usa pra ressincronizar
   * `lastMessageIdRef` e evitar 409 (`SESSION_LAST_MESSAGE_MISMATCH`) no
   * próximo turn. Best-effort: falha aqui não derruba o stream.
   */
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

  @Post("solo/:sessionId/narrate-start")
  async soloNarrateStart(
    @Param("sessionId") sessionId: string,
    @Body() body: { characterId: string },
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      // Backend-authoritative — DM agent depende de payload enriquecido pra
      // continuidade. Em fresh session ctx vem vazio (degrade-graceful);
      // em re-render pós-retomada, ctx tem scene/recap → DM mantém estado.
      const ctx = await this.resumeService.assemble(sessionId);
      const collector = new SseNarrationCollector();
      await this.aiProxyService.pipeStream(
        `/solo/${sessionId}/narrate-start`,
        {
          character_id: body.characterId,
          user_id: req.user!.id,
          sessionId,
          campaignId: ctx.campaignId,
          isResumed: ctx.isResumed,
          previousSessionId: ctx.previousSessionId,
          sceneContext: ctx.sceneContext,
          recentMessages: ctx.recentMessages,
          previousSessionSummary: ctx.previousSessionSummary,
          gapMinutes: ctx.gapMinutes,
        },
        res,
        (chunk) => collector.feed(chunk),
        async () => {
          await this.persistNarration(
            sessionId,
            req.user!.id,
            collector.finalize(),
          );
          await this.emitSessionSync(sessionId, res);
        },
      );
    } catch (err: any) {
      this.logger.error(`Solo narrate-start error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }

  @Post("solo/:sessionId/message")
  async soloMessage(
    @Param("sessionId") sessionId: string,
    @Body()
    body: {
      message: string;
      lastMessageId?: number | null;
      clientId?: string;
    },
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      // Spec 024 — monta payload enriquecido server-side: sceneContext,
      // recentMessages, isResumed, previousSessionSummary, hot-recap
      // (fire-and-forget) e session_resumed event quando aplicável.
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

      // Spec 024 follow-up — fonte de verdade do histórico não pode depender
      // do client persistir. Backend grava player_action ANTES do stream
      // (sobrevive a falha no agents) e narration DEPOIS (fire-and-forget).
      await this.persistPlayerAction(
        sessionId,
        req.user!.id,
        body.message,
        body.clientId,
      );
      const collector = new SseNarrationCollector();
      await this.aiProxyService.pipeStream(
        `/solo/${sessionId}/message`,
        {
          message: body.message,
          user_id: req.user!.id,
          // Spec 024 — payload enriquecido (camelCase per contract).
          sessionId,
          campaignId: ctx.campaignId,
          isResumed: ctx.isResumed,
          previousSessionId: ctx.previousSessionId,
          sceneContext: ctx.sceneContext,
          recentMessages: ctx.recentMessages,
          previousSessionSummary: ctx.previousSessionSummary,
          lastMessageId: body.lastMessageId ?? ctx.serverLastMessageId,
          gapMinutes: ctx.gapMinutes,
        },
        res,
        (chunk) => collector.feed(chunk),
        async () => {
          await this.persistNarration(
            sessionId,
            req.user!.id,
            collector.finalize(),
          );
          await this.emitSessionSync(sessionId, res);
        },
      );
    } catch (err: any) {
      this.logger.error(`Solo message error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }

  // ────── Multi-agent narrative pipeline (Spec 014/026 Pillar 4) ──────

  /**
   * Spec 026 Pillar 4 — proxy para `/narrative/turn` do diad-agents.
   *
   * Substitui `solo/:sessionId/message` para usuários migrados ao pipeline
   * multi-agent (Director / Narrator / Archivist / PreFlightOracle / Chaos).
   * Faz mesmo enrichment server-authoritative do soloMessage (sceneContext,
   * recentMessages, isResumed, previousSessionSummary, gap minutes) e
   * persiste player_action + narration via SseNarrationCollector.
   *
   * Diferenças vs `solo/:sessionId/message`:
   *  - body usa `playerInput` (alinhado ao contract /narrative/turn).
   *  - injeta headers `X-Service-Key` + `X-User-Id` no upstream pra que o
   *    BackendClient interno do agents impersone o owner da campanha.
   *  - emite SSE chunks com tipos do pipeline novo (`narrator`, `director`,
   *    `combat_starting`, `preflight_rolls`, `chaos_evaluated`, ...).
   *    Frontend (`useAiStream`) trata `narrator` como prose chunk.
   */
  @Post("narrative/:sessionId/turn")
  async narrativeTurn(
    @Param("sessionId") sessionId: string,
    @Body()
    body: {
      playerInput: string;
      lastMessageId?: number | null;
      clientId?: string;
      voiceProfile?: string;
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

      // Spec 026 Pillar 4 — `SceneContext` (Spec 018) não carrega `sceneId`
      // no top-level (só `scene.{title,description,mood,location}`). O
      // Coordinator agents precisa do sceneId pra dispatch
      // start_encounter_from_narrative — sem ele, encounter dispatch retorna
      // None silenciosamente. Injetamos via `sceneService.getActive()`.
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
          playerInput: body.playerInput,
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
          await this.persistNarration(
            sessionId,
            req.user!.id,
            collector.finalize(),
          );
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
   * Spec 026 Pillar 4 — abertura de sessão via pipeline multi-agent.
   *
   * Substitui `/ai/solo/:sessionId/narrate-start` (legacy DM agent que vazava
   * system prompt em sessões novas, ex: "Preciso do character_id..."). Mesmo
   * pipeline do `/ai/narrative/:sessionId/turn` mas com `playerInput=null`
   * — Director resolve via forcing rule "scene 1 → YOU beat" (Spec 014).
   * Filtros de leak (Pillar 2 camadas A+B+C) já cobrem o stream.
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
          await this.persistNarration(
            sessionId,
            req.user!.id,
            collector.finalize(),
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

  @Post("solo/:sessionId/action")
  async soloAction(
    @Param("sessionId") sessionId: string,
    @Body()
    body: {
      type: string;
      actionId?: string;
      targetId?: string;
      spellId?: string;
      text?: string;
      lastMessageId?: number | null;
      clientId?: string;
    },
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      // Backend-authoritative — combat actions precisam de scene_context +
      // recent_messages pro DM narrar coerente. Mesmo padrão de soloMessage.
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

      // Spec 024 follow-up — persiste a intenção do jogador como player_action.
      // Body livre (`text`) tem prioridade; senão monta string sintética da
      // ação estruturada pra ficar legível na timeline + retomada.
      const actionContent =
        body.text && body.text.trim().length > 0
          ? body.text
          : `${body.type}${body.actionId ? `:${body.actionId}` : ""}${
              body.targetId ? ` → ${body.targetId}` : ""
            }${body.spellId ? ` (${body.spellId})` : ""}`;
      await this.persistPlayerAction(
        sessionId,
        req.user!.id,
        actionContent,
        body.clientId,
      );
      const collector = new SseNarrationCollector();
      await this.aiProxyService.pipeStream(
        `/solo/${sessionId}/action`,
        {
          ...body,
          user_id: req.user!.id,
          sessionId,
          campaignId: ctx.campaignId,
          isResumed: ctx.isResumed,
          previousSessionId: ctx.previousSessionId,
          sceneContext: ctx.sceneContext,
          recentMessages: ctx.recentMessages,
          previousSessionSummary: ctx.previousSessionSummary,
          lastMessageId: body.lastMessageId ?? ctx.serverLastMessageId,
          gapMinutes: ctx.gapMinutes,
        },
        res,
        (chunk) => collector.feed(chunk),
        async () => {
          await this.persistNarration(
            sessionId,
            req.user!.id,
            collector.finalize(),
          );
          await this.emitSessionSync(sessionId, res);
        },
      );
    } catch (err: any) {
      this.logger.error(`Solo action error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
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
