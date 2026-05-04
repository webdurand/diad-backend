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
import type { AdvanceClockDto, CreateClockDto } from "./services/clock.service";
import { VowService } from "./services/vow.service";
import type { CreateVowDto } from "./services/vow.service";
import { NarrativeDecisionService } from "./services/narrative-decision.service";
import type { CreateNarrativeDecisionDto } from "./services/narrative-decision.service";
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
    private readonly vowService: VowService,
    private readonly decisionService: NarrativeDecisionService,
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

  // ============= VOWS (session-scoped) =============

  @Post("sessions/:sessionId/vows")
  async createVow(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Body() dto: CreateVowDto,
  ) {
    const session = await this.sessionService.ensureAccess(
      sessionId,
      getUserId(req),
    );
    if (session.campaignId) {
      await this.campaignService.ensureDmOwnership(
        session.campaignId,
        getUserId(req),
      );
    }
    return this.vowService.create(sessionId, dto);
  }

  @Get("sessions/:sessionId/vows")
  async listVows(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
  ) {
    await this.sessionService.ensureAccess(sessionId, getUserId(req));
    return this.vowService.listBySession(sessionId);
  }

  @Post("vows/:vowId/fulfill")
  async fulfillVow(@Req() req: AuthRequest, @Param("vowId") vowId: string) {
    const vow = await this.vowService.getById(vowId);
    const session = await this.sessionService.getById(vow.gameSessionId);
    if (session.campaignId) {
      await this.campaignService.ensureDmOwnership(
        session.campaignId,
        getUserId(req),
      );
    }
    return this.vowService.fulfill(vowId);
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
    return this.decisionService.top(
      sessionId,
      limit ? parseInt(limit, 10) : 5,
    );
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
  async listLore(@Req() req: AuthRequest, @Param("id", CampaignIdPipe) campaignId: string) {
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
