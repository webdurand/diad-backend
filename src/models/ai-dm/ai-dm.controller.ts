import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CampaignService } from "../world/services/campaign.service";
import { CampaignIdPipe } from "../world/pipes/campaign-id.pipe";
import { SceneService } from "../session/services/scene.service";
import { SessionService } from "../game-engine/services/session.service";
import type { ArcBeat } from "src/entities/campaign.entity";
import { ClockService } from "./services/clock.service";
import type {
  AdvanceClockDto,
  CreateClockDto,
  ResolveClockDto,
} from "./services/clock.service";
import { NarrativeDecisionService } from "./services/narrative-decision.service";
import type { CreateNarrativeDecisionDto } from "./services/narrative-decision.service";
import { ContinuityFactService } from "./services/continuity-fact.service";
import type { CreateContinuityFactDto } from "./services/continuity-fact.service";
import { LoreEntryService } from "./services/lore-entry.service";
import type { CreateLoreEntryDto } from "./services/lore-entry.service";
import { VoiceProfileService } from "./services/voice-profile.service";
import { AiUsageService } from "./services/ai-usage.service";
import type { LogAiUsageDto } from "./services/ai-usage.service";

interface AuthRequest extends Request {
  user?: { id: string; email: string; name?: string; role?: string };
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException("Usuário não autenticado.");
  return id;
}

@Controller()
@UseGuards(AuthGuard)
export class AiDmController {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly sceneService: SceneService,
    private readonly sessionService: SessionService,
    private readonly clockService: ClockService,
    private readonly decisionService: NarrativeDecisionService,
    private readonly continuityFactService: ContinuityFactService,
    private readonly loreService: LoreEntryService,
    private readonly voiceService: VoiceProfileService,
    private readonly aiUsageService: AiUsageService,
  ) {}

  // ============= ARC TRANSITION (Director force) =============

  @Post("campaigns/:id/arc/transition")
  async forceArcTransition(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: { newBeat: ArcBeat; reason?: string; atScene?: number },
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.sceneService.forceArcTransition(
      campaignId,
      body.newBeat,
      body.reason ?? "director_forced",
      body.atScene,
    );
  }

  // ============= CLOCKS =============

  @Post("campaigns/:id/clocks")
  async createClock(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() dto: CreateClockDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.clockService.create(campaignId, dto);
  }

  @Get("campaigns/:id/clocks")
  async listClocks(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    const clocks = await this.clockService.listByCampaign(campaignId);
    const campaign = await this.campaignService.getById(campaignId);
    const isDm = campaign.dmUserId === getUserId(req);
    return isDm ? clocks : clocks.filter((c) => c.visibleToPlayer);
  }

  @Get("sessions/:sessionId/clocks")
  async listSessionClocks(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
  ) {
    const userId = getUserId(req);
    const session = await this.sessionService.ensureAccess(sessionId, userId);
    const clocks = await this.clockService.listBySession(sessionId);
    if (!session.campaignId) return clocks.filter((c) => c.visibleToPlayer);

    const campaign = await this.campaignService.getById(session.campaignId);
    const isDm = campaign.dmUserId === userId;
    return isDm ? clocks : clocks.filter((c) => c.visibleToPlayer);
  }

  @Post("clocks/:clockId/advance")
  async advanceClock(
    @Req() req: AuthRequest,
    @Param("clockId") clockId: string,
    @Body() dto: AdvanceClockDto,
  ) {
    const clock = await this.clockService.getById(clockId);
    await this.campaignService.ensureDmOwnership(
      clock.campaignId,
      getUserId(req),
    );
    return this.clockService.advance(clockId, dto);
  }

  @Post("clocks/:clockId/resolve")
  async resolveClock(
    @Req() req: AuthRequest,
    @Param("clockId") clockId: string,
    @Body() dto: ResolveClockDto,
  ) {
    const clock = await this.clockService.getById(clockId);
    await this.campaignService.ensureDmOwnership(
      clock.campaignId,
      getUserId(req),
    );
    return this.clockService.resolve(clockId, dto);
  }

  // ============= NARRATIVE DECISIONS (session-scoped) =============

  @Post("sessions/:sessionId/narrative-decisions")
  async createDecision(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Body() dto: CreateNarrativeDecisionDto,
  ) {
    await this.sessionService.ensureAccess(sessionId, getUserId(req));
    return this.decisionService.create(sessionId, dto);
  }

  @Get("sessions/:sessionId/narrative-decisions")
  async listDecisions(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    await this.sessionService.ensureAccess(sessionId, getUserId(req));
    return this.decisionService.listBySession(sessionId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get("sessions/:sessionId/narrative-decisions/top")
  async topDecisions(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Query("limit") limit?: string,
  ) {
    await this.sessionService.ensureAccess(sessionId, getUserId(req));
    return this.decisionService.top(sessionId, limit ? parseInt(limit, 10) : 5);
  }

  // ============= CONTINUITY FACTS (session-scoped) =============

  @Post("sessions/:sessionId/continuity-facts")
  async createContinuityFact(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Body() dto: CreateContinuityFactDto,
  ) {
    await this.sessionService.ensureAccess(sessionId, getUserId(req));
    return this.continuityFactService.create(sessionId, dto);
  }

  @Get("sessions/:sessionId/continuity-facts/relevant")
  async relevantContinuityFacts(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Query("limit") limit?: string,
    @Query("entityIds") entityIds?: string,
    @Query("q") q?: string,
  ) {
    await this.sessionService.ensureAccess(sessionId, getUserId(req));
    return this.continuityFactService.listRelevant(sessionId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      entityIds: entityIds
        ? entityIds
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : undefined,
      q,
    });
  }

  // ============= LORE ENTRIES =============

  @Post("campaigns/:id/lore-entries")
  async createLore(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() dto: CreateLoreEntryDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.loreService.create(campaignId, dto);
  }

  @Get("campaigns/:id/lore-entries")
  async listLore(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.loreService.listByCampaign(campaignId);
  }

  // ============= VOICE PROFILES =============

  @Get("voice-profiles")
  async listVoices() {
    return this.voiceService.listAll();
  }

  @Get("voice-profiles/:id")
  async getVoice(@Param("id") id: string) {
    return this.voiceService.getById(id);
  }

  // ============= AI USAGE / COST TRACKING =============

  @Post("campaigns/:id/ai-usage")
  async ingestAiUsage(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() dto: Omit<LogAiUsageDto, "campaignId">,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.aiUsageService.log({ ...dto, campaignId });
  }
}
