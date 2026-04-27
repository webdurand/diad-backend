import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CampaignService } from "../world/services/campaign.service";
import { SceneService } from "../session/services/scene.service";
import type { ArcBeat } from "src/entities/campaign.entity";
import { ClockService } from "./services/clock.service";
import type { AdvanceClockDto, CreateClockDto } from "./services/clock.service";
import { VowService } from "./services/vow.service";
import type { CreateVowDto, UpdateVowDto } from "./services/vow.service";
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
    @Param("id") campaignId: string,
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
    @Param("id") campaignId: string,
    @Body() dto: CreateClockDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.clockService.create(campaignId, dto);
  }

  @Get("campaigns/:id/clocks")
  async listClocks(@Req() req: AuthRequest, @Param("id") campaignId: string) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    const clocks = await this.clockService.listByCampaign(campaignId);
    // Hidden clocks ficam visíveis ao DM sempre, e ao player só se visibleToPlayer=true.
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

  // ============= VOWS =============

  @Post("campaigns/:id/vows")
  async createVow(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Body() dto: CreateVowDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.vowService.create(campaignId, dto);
  }

  @Get("campaigns/:id/vows")
  async listVows(@Req() req: AuthRequest, @Param("id") campaignId: string) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.vowService.listByCampaign(campaignId);
  }

  @Patch("vows/:vowId")
  async updateVow(
    @Req() req: AuthRequest,
    @Param("vowId") vowId: string,
    @Body() dto: UpdateVowDto,
  ) {
    const vow = await this.vowService.getById(vowId);
    await this.campaignService.ensureDmOwnership(
      vow.campaignId,
      getUserId(req),
    );
    return this.vowService.update(vowId, dto);
  }

  @Post("vows/:vowId/fulfill")
  async fulfillVow(@Req() req: AuthRequest, @Param("vowId") vowId: string) {
    const vow = await this.vowService.getById(vowId);
    await this.campaignService.ensureDmOwnership(
      vow.campaignId,
      getUserId(req),
    );
    return this.vowService.fulfill(vowId);
  }

  // ============= NARRATIVE DECISIONS =============

  @Post("campaigns/:id/narrative-decisions")
  async createDecision(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Body() dto: CreateNarrativeDecisionDto,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.decisionService.create(campaignId, dto);
  }

  @Get("campaigns/:id/narrative-decisions")
  async listDecisions(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.decisionService.listByCampaign(campaignId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get("campaigns/:id/narrative-decisions/top")
  async topDecisions(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Query("limit") limit?: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.decisionService.top(
      campaignId,
      limit ? parseInt(limit, 10) : 5,
    );
  }

  // ============= LORE ENTRIES =============

  @Post("campaigns/:id/lore-entries")
  async createLore(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Body() dto: CreateLoreEntryDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.loreService.create(campaignId, dto);
  }

  @Get("campaigns/:id/lore-entries")
  async listLore(@Req() req: AuthRequest, @Param("id") campaignId: string) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.loreService.listByCampaign(campaignId);
  }

  // ============= VOICE PROFILES =============
  // path `/voice-profiles` (não /library/voice-profiles) pra evitar conflito
  // com LibraryController genérico que intercepta /library/:entity.

  @Get("voice-profiles")
  async listVoices() {
    return this.voiceService.listAll();
  }

  @Get("voice-profiles/:id")
  async getVoice(@Param("id") id: string) {
    return this.voiceService.getById(id);
  }

  // ============= AI USAGE / COST TRACKING =============
  // Ingest chamado por diad-agents com X-Service-Key (rotas internas tratadas
  // em service-to-service; aqui versão DM-authenticated pra telemetria manual).

  @Post("campaigns/:id/ai-usage")
  async ingestAiUsage(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Body() dto: Omit<LogAiUsageDto, "campaignId">,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.aiUsageService.log({ ...dto, campaignId });
  }

  @Get("campaigns/:id/cost-summary")
  async costSummary(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Query("targetPerSessionUsd") target?: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    const targetUsd = target ? parseFloat(target) : 0.5;
    return this.aiUsageService.summaryForCampaign(campaignId, targetUsd);
  }
}
