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
import { DomainException } from "src/common/observability/errors/diad-exception";
import { GameEventEntity } from "src/entities/game-event.entity";
import type { AuthRequest } from "../auth/auth.types";

/**
 * Spec 027 (M2 follow-up) — mapping systemHint → eventType injetado
 * em sceneContext.recent_events. Quando o frontend dispara um turn com
 * `systemHint='post_combat'` ou `'post_fate_choice'`, o backend lê o
 * último evento estruturado correspondente do `game_events` e adiciona
 * em `sceneContext.recent_events` ANTES de fazer proxy pro agno. O
 * Coordinator branch correspondente lê esse evento pra montar guidance
 * estruturado por outcome (vitória/derrota/retreat ou A/B/C/D).
 *
 * Mapping é exhaustive — qualquer systemHint não listado é forwarded
 * sem injeção (no-op).
 */
const SYSTEM_HINT_EVENT_MAP: Record<string, string> = {
  post_combat: "encounter_outcome_summary",
  post_fate_choice: "fate_ladder_resolved",
};

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
    @InjectRepository(GameEventEntity)
    private readonly gameEventRepo: Repository<GameEventEntity>,
  ) {}

  /**
   * Spec 027 (M2 follow-up) — busca último evento de um tipo na sessão e
   * injeta em `sceneContext.recent_events`. Quando systemHint='post_combat',
   * lê `encounter_outcome_summary`; quando 'post_fate_choice', lê
   * `fate_ladder_resolved`. No-op pra hints não-mapeados.
   *
   * Best-effort: erro de query loga warn mas não derruba o turn (Narrator
   * cai num fallback genérico).
   */
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
   *
   * Spec 027 (M2/AC2.11) — retorna o serverId persistido pra que o caller
   * emita `narration_persisted` SSE event antes de fechar o stream. Frontend
   * usa esse event pra substituir o `entry-N` otimista por `srv-narr-<uuid>`
   * inline (sem esperar `session_sync` do fim do stream).
   */
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

  /**
   * Spec 027 (M2/AC2.11) — emite SSE event `narration_persisted` carregando
   * o serverId real da narração (`srv-narr-<uuid>`). Frontend substitui o
   * `entry-N` otimista por esse id, eliminando o duplicado D4.
   *
   * Best-effort — falha não derruba stream. Caller passa `clientTempId` se
   * tiver (vem do request body); nulo é aceito.
   */
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

  /**
   * Spec 027 (M1, AC1.7+1.8) — endpoint legado removido. Pipeline DM agent
   * monolítico (40 tools, prompt leak, ataques ignorados) substituído pelo
   * Coordinator multi-agent. Frontend migrou pra `/ai/narrative/:sessionId/turn`
   * (commit cd957d9). Mantemos a rota só pra responder 410 estruturado a
   * clients antigos cacheados.
   */
  @Post("solo/:sessionId/narrate-start")
  async soloNarrateStartDeprecated(
    @Param("sessionId") sessionId: string,
  ): Promise<never> {
    throw new DomainException(
      ErrorCode.LEGACY_ENDPOINT_DEPRECATED,
      "Endpoint legado removido na spec 027.",
      {
        context: { sessionId, replacement: "/ai/narrative/:sessionId/turn" },
      },
    );
  }

  /**
   * Spec 027 (M1, AC1.7+1.8) — ver `soloNarrateStartDeprecated`.
   */
  @Post("solo/:sessionId/message")
  async soloMessageDeprecated(
    @Param("sessionId") sessionId: string,
  ): Promise<never> {
    throw new DomainException(
      ErrorCode.LEGACY_ENDPOINT_DEPRECATED,
      "Endpoint legado removido na spec 027.",
      {
        context: { sessionId, replacement: "/ai/narrative/:sessionId/turn" },
      },
    );
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
