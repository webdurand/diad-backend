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
import { MetaQueryService } from "../session/services/meta-query.service";
import {
  DialogueActionGeneratorService,
  type DialogueAction,
} from "../game-engine/services/dialogue-action-generator.service";
import { OpenModeActionGeneratorService } from "../game-engine/services/open-mode-action-generator.service";
import {
  SseNarrationCollector,
  type CollectedChoice,
  type CollectedDiceRoll,
  type CollectedTurnOutcome,
} from "./sse-narration-collector";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { GameEventEntity } from "src/entities/game-event.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { PendingGuardDispatchEntity } from "src/entities/pending-guard-dispatch.entity";
import { StartEncounterFromNarrativeService } from "../game-engine/services/start-encounter-from-narrative.service";
import type { AuthRequest } from "../auth/auth.types";
import { deriveSceneMode, type SceneMode } from "src/shared/scene-mode";
import { CharacterSheetService } from "../characters/services/character-sheet.service";

const SYSTEM_HINT_EVENT_MAP: Record<string, string> = {
  post_combat: "encounter_outcome_summary",
  post_fate_choice: "fate_ladder_resolved",
};

const AMBIENT_INTENTS = new Set([
  "examine_interactable",
  "investigate_scene",
  "observe_scene",
]);

type TransitionScope =
  | "greeting"
  | "arrival"
  | "departure"
  | "close"
  | "post_event"
  | "ambient"
  | "none";

const TRANSITION_SCOPE_BY_SYSTEM_HINT: Record<string, TransitionScope> = {
  transition_dialogue_greeting: "greeting",
  transition_poi_arrival: "arrival",
  transition_travel_start: "departure",
  transition_dialogue_close: "close",
  post_combat: "post_event",
  post_fate_choice: "post_event",
  post_long_rest: "post_event",
};

const LEGACY_DIALOGUE_OPEN_HINT = "dialogue_open";
const DIALOGUE_GREETING_HINT = "transition_dialogue_greeting";

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

// Lock por SESSÃO (spec 049): a idempotência acima só barra o MESMO payload;
// dois turnos diferentes em paralelo geravam narrações contraditórias e cenas
// duplicadas. Enquanto um stream narra, qualquer outro turno da sessão é 409.
// TTL alto é só rede de segurança caso o stream morra sem passar pelo finally.
const SESSION_TURN_LOCK_TTL_MS = 180_000;
const sessionTurnLocks = new Map<string, number>();

function tryAcquireSessionTurnLock(sessionId: string): boolean {
  const now = Date.now();
  const expiresAt = sessionTurnLocks.get(sessionId);
  if (expiresAt && expiresAt > now) return false;
  sessionTurnLocks.set(sessionId, now + SESSION_TURN_LOCK_TTL_MS);
  return true;
}

function releaseSessionTurnLock(sessionId: string): void {
  sessionTurnLocks.delete(sessionId);
}

export function __resetIdempotencyForTests(): void {
  inFlightRequests.clear();
  sessionTurnLocks.clear();
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
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly metaQueryService: MetaQueryService,
    private readonly dialogueActionGenerator: DialogueActionGeneratorService,
    private readonly openModeActionGenerator: OpenModeActionGeneratorService,
    private readonly characterSheetService: CharacterSheetService,
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


  private async persistTurnOutcomes(
    sessionId: string,
    userId: string,
    outcomes: CollectedTurnOutcome[],
  ): Promise<void> {
    if (!outcomes || outcomes.length === 0) return;
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.outcomeType === "fact_learned") continue;
      try {
        await this.sessionMessageService.append({
          sessionId,
          userId,
          kind: "turn_outcome",
          content: JSON.stringify(outcome),
          clientId: `srv-outcome-${createHash("sha256")
            .update(
              `${sessionId}:${outcome.createdAt}:${outcome.outcomeType}:${outcome.title}:${index}`,
            )
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
    this.emitSse(
      res,
      {
        type: "narration_persisted",
        serverId,
        clientTempId: clientTempId ?? null,
      },
      "narration_persisted",
    );
  }

  private async emitSessionSync(
    sessionId: string,
    res: Response,
  ): Promise<void> {
    try {
      const lastSequenceNumber =
        await this.sessionMessageService.getMaxSequenceNumber(sessionId);
      this.emitSse(
        res,
        {
          type: "session_sync",
          lastSequenceNumber,
        },
        "session_sync",
      );
    } catch (err: any) {
      this.logger.warn(
        `session_sync emit failed (session=${sessionId}): ${err?.message}`,
      );
    }
  }

  private async buildBimodalState(
    sessionId: string,
    userId: string,
    ctx: {
      activeSceneId?: string | null;
      sceneContext?: Record<string, any> | null;
      session?: GameSessionEntity | null;
    },
    turn?: {
      playerInput?: string | null;
      intent?: string | null;
      systemHint?: string | null;
    },
  ): Promise<{
    bimodalLoopEnabled: boolean;
    idleLoopEnabled: boolean;
    sceneId: string | null;
    sceneMode: SceneMode;
    transitionScope: TransitionScope;
    socialCollective: boolean;
    focalNpcId: string | null;
    availableActions: DialogueAction[];
    metaQueryRemaining: number;
  } | null> {
    const session =
      ctx.session ?? (await this.sessionRepo.findOne({ where: { id: sessionId } }));
    if (session?.config?.bimodalLoopEnabled !== true) return null;

    const sceneContext = ctx.sceneContext ?? null;
    const scene = sceneContext?.scene ?? {};
    const stage = sceneContext?.stage ?? {};
    const sceneId = ctx.activeSceneId ?? scene.id ?? null;
    const focalNpcId =
      scene.currentInterlocutorNpcId ??
      stage.currentInterlocutor?.id ??
      stage.movementLock?.interlocutorNpcId ??
      null;
    const sceneMode = deriveSceneMode(session, {
      currentInterlocutorNpcId: focalNpcId,
    });
    const npcsPresent = Array.isArray(sceneContext?.npcsPresent)
      ? sceneContext.npcsPresent
      : [];
    const interactables = Array.isArray(sceneContext?.interactables)
      ? sceneContext.interactables
      : Array.isArray(scene.contextSnapshot?.interactables)
        ? scene.contextSnapshot.interactables
        : [];
    const metaQueryRemaining = sceneId
      ? await this.metaQueryService.remainingForScene(sessionId, sceneId)
      : 3;
    const characterSkills = await this.loadProficientSkillSlugs(session, userId);
    const characterKnownFacts = this.extractKnownFacts(sceneContext);

    return {
      bimodalLoopEnabled: true,
      idleLoopEnabled: session.config?.idleLoopEnabled === true,
      sceneId,
      sceneMode,
      transitionScope: this.deriveTransitionScope(turn ?? {}),
      socialCollective: scene.socialCollective === true,
      focalNpcId,
      availableActions: this.buildBimodalActions({
        sceneMode,
        focalNpcId,
        npcsPresent,
        interactables,
        characterSkills,
        characterKnownFacts,
      }),
      metaQueryRemaining,
    };
  }

  private deriveTransitionScope(input: {
    systemHint?: string | null;
    intent?: string | null;
    playerInput?: string | null;
  }): TransitionScope {
    const systemHint =
      typeof input.systemHint === "string" ? input.systemHint.trim() : "";
    if (systemHint && TRANSITION_SCOPE_BY_SYSTEM_HINT[systemHint]) {
      return TRANSITION_SCOPE_BY_SYSTEM_HINT[systemHint];
    }

    const intent = typeof input.intent === "string" ? input.intent.trim() : "";
    if (AMBIENT_INTENTS.has(intent)) return "ambient";

    if (this.hasExplicitPlayerInput(input.playerInput)) return "ambient";

    return "none";
  }

  private hasExplicitPlayerInput(playerInput: string | null | undefined): boolean {
    return typeof playerInput === "string" && playerInput.trim().length > 0;
  }

  private isIdleOpenTurnBlocked(input: {
    playerInput?: string | null;
    bimodalState: {
      idleLoopEnabled: boolean;
      sceneMode: SceneMode;
      transitionScope: TransitionScope;
    };
  }): boolean {
    return (
      input.bimodalState.idleLoopEnabled === true &&
      input.bimodalState.sceneMode === "open" &&
      input.bimodalState.transitionScope === "none" &&
      !this.hasExplicitPlayerInput(input.playerInput)
    );
  }

  private normalizeSystemHintForIdleLoop(
    systemHint: string | null | undefined,
    session: GameSessionEntity | null,
  ):
    | {
        ok: true;
        systemHint?: string;
        warning?: {
          code: ErrorCode;
          deprecatedHint: string;
          replacement: string;
          idleLoopEnabled: boolean;
        };
      }
    | {
        ok: false;
        status: number;
        code: ErrorCode;
        content: string;
      } {
    const rawHint = typeof systemHint === "string" ? systemHint.trim() : "";
    if (rawHint !== LEGACY_DIALOGUE_OPEN_HINT) {
      return { ok: true, systemHint: rawHint || undefined };
    }

    const idleLoopEnabled = session?.config?.idleLoopEnabled === true;
    if (idleLoopEnabled) {
      return {
        ok: false,
        status: 410,
        code: ErrorCode.NARRATIVE_TURN_SYSTEM_HINT_DEPRECATED,
        content:
          "systemHint dialogue_open foi removido para sessões com idleLoopEnabled=true. Use transition_dialogue_greeting.",
      };
    }

    return {
      ok: true,
      systemHint: DIALOGUE_GREETING_HINT,
      warning: {
        code: ErrorCode.NARRATIVE_TURN_SYSTEM_HINT_LEGACY_ALIAS,
        deprecatedHint: LEGACY_DIALOGUE_OPEN_HINT,
        replacement: DIALOGUE_GREETING_HINT,
        idleLoopEnabled,
      },
    };
  }

  private emitNarrativeTurnError(
    res: Response,
    status: number,
    code: ErrorCode,
    content: string,
    context?: Record<string, unknown>,
  ): void {
    res.statusCode = status;
    this.emitSse(
      res,
      {
        type: "error",
        code,
        content,
        ...(context ? { context } : {}),
      },
      "error",
    );
    res.end();
  }

  private buildBimodalActions(input: {
    sceneMode: SceneMode;
    focalNpcId: string | null;
    npcsPresent: Array<Record<string, any>>;
    interactables?: Array<Record<string, any>>;
    characterSkills: string[];
    characterKnownFacts: string[];
  }): DialogueAction[] {
    if (input.sceneMode === "dialogue") {
      const focal = input.npcsPresent.find((npc) => npc.id === input.focalNpcId);
      return this.dialogueActionGenerator.generate({
        characterSkills: input.characterSkills,
        characterKnownFacts: input.characterKnownFacts,
        npc: {
          id: focal?.id ?? input.focalNpcId ?? "unknown",
          name: focal?.name ?? "Interlocutor",
          tags: this.asStringArray(focal?.tags),
          knowledgeScope: this.asStringArray(focal?.knowledgeScope),
        },
      });
    }
    if (input.sceneMode === "open") {
      return this.openModeActionGenerator.generate({
        npcsPresent: input.npcsPresent,
        interactables: input.interactables,
        characterSkills: input.characterSkills,
      });
    }
    return [];
  }

  private async loadProficientSkillSlugs(
    session: GameSessionEntity,
    userId: string,
  ): Promise<string[]> {
    const characterId = session.characterIds?.[0];
    if (!characterId) return [];
    const sheet = await this.characterSheetService.computeSheet(userId, characterId);
    return (sheet.skills ?? [])
      .filter((skill) => skill.proficient)
      .map((skill) => skill.slug);
  }

  private extractKnownFacts(sceneContext: Record<string, any> | null): string[] {
    const partyKnowledge = Array.isArray(sceneContext?.partyKnowledge)
      ? sceneContext.partyKnowledge
      : [];
    const facts: string[] = [];
    for (const fact of partyKnowledge) {
      if (typeof fact?.knowledgeKey === "string") facts.push(fact.knowledgeKey);
      if (typeof fact?.knowledgeValue === "string") facts.push(fact.knowledgeValue);
    }
    return facts;
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private emitSse(
    res: Response,
    payload: Record<string, unknown>,
    label = "sse",
  ): void {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (typeof (res as any).flush === "function") {
        (res as any).flush();
      }
    } catch (err: any) {
      this.logger.warn(`${label} emit failed: ${err?.message}`);
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
    const currentMaxSeq = await this.sessionMessageService.getMaxSequenceNumber(
      args.sessionId,
    );

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



  @Post("narrative/:sessionId/turn")
  async narrativeTurn(
    @Param("sessionId") sessionId: string,
    @Body()
    body: {
      playerInput: string;
      lastMessageId?: number | null;
      clientId?: string;
      voiceProfile?: string;



      intent?: string;




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
    let tFirstSse = 0;
    let earlyReturnReason: string | null = null;
    const emitStatus = (content: string) => {
      if (tFirstSse === 0) tFirstSse = performance.now();
      this.emitSse(res, { type: "status", content }, "status");
    };




    const idempotencyKey = buildIdempotencyKey(
      sessionId,
      body.lastMessageId,
      JSON.stringify({
        playerInput: body.playerInput ?? "",
        intent: body.intent ?? null,
        systemHint: body.systemHint ?? null,
        restEventKind: body.restEventKind ?? null,
      }),
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
    if (!tryAcquireSessionTurnLock(sessionId)) {
      releaseIdempotency(idempotencyKey);
      res.statusCode = 409;
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          code: ErrorCode.NARRATIVE_TURN_IN_PROGRESS,
          content: "O Mestre ainda está narrando o turno anterior — aguarde.",
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
      res.setHeader("X-Session-Is-Resumed", ctx.isResumed ? "true" : "false");

      const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
      const hintNormalization = this.normalizeSystemHintForIdleLoop(
        body.systemHint,
        session,
      );
      if (!hintNormalization.ok) {
        earlyReturnReason = `blocked:${hintNormalization.code}`;
        this.emitNarrativeTurnError(
          res,
          hintNormalization.status,
          hintNormalization.code,
          hintNormalization.content,
          {
            deprecatedHint: body.systemHint ?? null,
            replacement: DIALOGUE_GREETING_HINT,
            specVersion: "046",
            idleLoopEnabled: session?.config?.idleLoopEnabled === true,
          },
        );
        return;
      }
      const normalizedSystemHint = hintNormalization.systemHint;

      let sceneContextForAgent: Record<string, any> | null = ctx.activeSceneId
        ? { ...(ctx.sceneContext ?? {}), sceneId: ctx.activeSceneId }
        : ctx.sceneContext;

      const bimodalState = await this.buildBimodalState(
        sessionId,
        req.user!.id,
        { ...ctx, session },
        {
          playerInput: body.playerInput,
          intent: body.intent,
          systemHint: normalizedSystemHint,
        },
      );

      if (
        bimodalState &&
        this.isIdleOpenTurnBlocked({
          playerInput: body.playerInput,
          bimodalState,
        })
      ) {
        earlyReturnReason = `blocked:${ErrorCode.NARRATIVE_TURN_NOT_ALLOWED_IN_IDLE_OPEN}`;
        this.emitNarrativeTurnError(
          res,
          422,
          ErrorCode.NARRATIVE_TURN_NOT_ALLOWED_IN_IDLE_OPEN,
          "O jogo está aguardando uma ação explícita do jogador.",
          {
            sceneMode: bimodalState.sceneMode,
            intent: body.intent ?? null,
            hasPlayerInput: this.hasExplicitPlayerInput(body.playerInput),
            hasSystemHint: Boolean(normalizedSystemHint),
            idleLoopEnabled: bimodalState.idleLoopEnabled,
          },
        );
        return;
      }

      emitStatus("Recolhendo memórias da cena...");

      if (hintNormalization.warning) {
        this.logger.warn("narrative_turn.system_hint_legacy_alias", {
          code: hintNormalization.warning.code,
          sessionId,
          deprecatedHint: hintNormalization.warning.deprecatedHint,
          replacement: hintNormalization.warning.replacement,
          idleLoopEnabled: hintNormalization.warning.idleLoopEnabled,
        });
        this.emitSse(
          res,
          {
            type: "warning",
            code: hintNormalization.warning.code,
            deprecatedHint: hintNormalization.warning.deprecatedHint,
            replacement: hintNormalization.warning.replacement,
          },
          "warning",
        );
      }

      if (ctx.lastMessageMismatch) {






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
      if (bimodalState) {
        this.emitSse(
          res,
          { type: "bimodal_state", ...bimodalState },
          "bimodal_state",
        );
        sceneContextForAgent = {
          ...(sceneContextForAgent ?? {}),
          transitionScope: bimodalState.transitionScope,
          bimodalState,
        };
      }





      sceneContextForAgent = (await this.injectSystemHintEvent(
        sessionId,
        normalizedSystemHint,
        sceneContextForAgent as Record<string, any> | null | undefined,
      )) as typeof sceneContextForAgent;







      const postCombatEncounterId =
        normalizedSystemHint === "post_combat"
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
          this.emitNarrationPersisted(
            res,
            existing.clientId ?? postCombatClientId,
            body.clientId,
          );
          await this.emitSessionSync(sessionId, res);
          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
          res.end();
          return;
        }
      }

      const collector = new SseNarrationCollector();
      const narrationClientId =
        postCombatClientId ?? `srv-narr-${randomUUID()}`;
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


          ...(body.intent ? { intent: body.intent } : {}),


          ...(normalizedSystemHint ? { systemHint: normalizedSystemHint } : {}),
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
        (info) => {
          earlyReturnReason = `upstream_${info.kind}:${info.status ?? "na"}`;
          this.logger.warn(
            `Narrative turn upstream failure session=${sessionId} ` +
              `kind=${info.kind} status=${info.status ?? "na"}`,
          );
        },
      );
    } catch (err: any) {
      earlyReturnReason = `error:${err?.name ?? "unknown"}`;
      this.logger.error(`Narrative turn error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    } finally {
      releaseIdempotency(idempotencyKey);
      releaseSessionTurnLock(sessionId);
      const tEnd = performance.now();
      const prePersistMs =
        tAgentsCallStart > 0 ? Math.round(tAgentsCallStart - tStart) : null;
      const firstSseMs =
        tFirstSse > 0 ? Math.round(tFirstSse - tStart) : null;
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
          `first_sse_ms=${firstSseMs ?? "null"} ` +
          `pre_persist_ms=${prePersistMs ?? "null"} ` +
          `agents_call_ms=${agentsCallMs ?? "null"} ` +
          `post_persist_ms=${postPersistMs ?? "null"}` +
          (earlyReturnReason ? ` early_return=${earlyReturnReason}` : ""),
      );
    }
  }


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

    const tStart = performance.now();
    let tFirstSse = 0;
    let tAgentsCallStart = 0;
    let earlyReturnReason: string | null = null;
    const emitStatus = (content: string) => {
      if (tFirstSse === 0) tFirstSse = performance.now();
      this.emitSse(res, { type: "status", content }, "status");
    };




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
    if (!tryAcquireSessionTurnLock(sessionId)) {
      releaseIdempotency(idempotencyKey);
      res.statusCode = 409;
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          code: ErrorCode.NARRATIVE_TURN_IN_PROGRESS,
          content: "O Mestre ainda está narrando — aguarde a cena atual terminar.",
        })}\n\n`,
      );
      res.end();
      return;
    }

    try {
      emitStatus("Recolhendo memórias da cena...");

      const ctx = await this.resumeService.assemble(sessionId);

      let sceneContextForAgent: Record<string, any> | null = ctx.activeSceneId
        ? { ...(ctx.sceneContext ?? {}), sceneId: ctx.activeSceneId }
        : ctx.sceneContext;
      const bimodalState = await this.buildBimodalState(
        sessionId,
        req.user!.id,
        ctx,
      );
      if (bimodalState) {
        this.emitSse(
          res,
          { type: "bimodal_state", ...bimodalState },
          "bimodal_state",
        );
        sceneContextForAgent = {
          ...(sceneContextForAgent ?? {}),
          bimodalState,
        };
      }

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
      tAgentsCallStart = performance.now();
      await this.aiProxyService.pipeStream(
        "/narrative/turn",
        {
          campaignId: ctx.campaignId,
          sessionId,
          turnKind: "start",
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
        (info) => {
          earlyReturnReason = `upstream_${info.kind}:${info.status ?? "na"}`;
          this.logger.warn(
            `Narrative start upstream failure session=${sessionId} ` +
              `kind=${info.kind} status=${info.status ?? "na"}`,
          );
        },
      );
    } catch (err: any) {
      earlyReturnReason = `error:${err?.name ?? "unknown"}`;
      this.logger.error(`Narrative start error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    } finally {
      releaseIdempotency(idempotencyKey);
      releaseSessionTurnLock(sessionId);
      const tEnd = performance.now();
      const firstSseMs =
        tFirstSse > 0 ? Math.round(tFirstSse - tStart) : null;
      const prePersistMs =
        tAgentsCallStart > 0 ? Math.round(tAgentsCallStart - tStart) : null;
      this.logger.log(
        `ai.narrative_start.streamtrace session=${sessionId} ` +
          `total_ms=${Math.round(tEnd - tStart)} ` +
          `first_sse_ms=${firstSseMs ?? "null"} ` +
          `pre_persist_ms=${prePersistMs ?? "null"}` +
          (earlyReturnReason ? ` early_return=${earlyReturnReason}` : ""),
      );
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
