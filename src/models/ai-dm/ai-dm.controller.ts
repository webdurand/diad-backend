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
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CampaignService } from '../world/services/campaign.service';
import { ClockService } from './services/clock.service';
import type {
  AdvanceClockDto,
  CreateClockDto,
} from './services/clock.service';
import { VowService } from './services/vow.service';
import type {
  CreateVowDto,
  UpdateVowDto,
} from './services/vow.service';
import { NarrativeDecisionService } from './services/narrative-decision.service';
import type { CreateNarrativeDecisionDto } from './services/narrative-decision.service';
import { LoreEntryService } from './services/lore-entry.service';
import type { CreateLoreEntryDto } from './services/lore-entry.service';
import { VoiceProfileService } from './services/voice-profile.service';

interface AuthRequest extends Request {
  user?: { id: string; email: string; name?: string; role?: string };
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException('Usuário não autenticado.');
  return id;
}

@Controller()
@UseGuards(AuthGuard)
export class AiDmController {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly clockService: ClockService,
    private readonly vowService: VowService,
    private readonly decisionService: NarrativeDecisionService,
    private readonly loreService: LoreEntryService,
    private readonly voiceService: VoiceProfileService,
  ) {}

  // ============= CLOCKS =============

  @Post('campaigns/:id/clocks')
  async createClock(
    @Req() req: AuthRequest,
    @Param('id') campaignId: string,
    @Body() dto: CreateClockDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.clockService.create(campaignId, dto);
  }

  @Get('campaigns/:id/clocks')
  async listClocks(
    @Req() req: AuthRequest,
    @Param('id') campaignId: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    const clocks = await this.clockService.listByCampaign(campaignId);
    // Hidden clocks ficam visíveis ao DM sempre, e ao player só se visibleToPlayer=true.
    const campaign = await this.campaignService.getById(campaignId);
    const isDm = campaign.dmUserId === getUserId(req);
    return isDm ? clocks : clocks.filter((c) => c.visibleToPlayer);
  }

  @Patch('clocks/:clockId/advance')
  async advanceClock(
    @Req() req: AuthRequest,
    @Param('clockId') clockId: string,
    @Body() dto: AdvanceClockDto,
  ) {
    const clock = await this.clockService.getById(clockId);
    await this.campaignService.ensureDmOwnership(clock.campaignId, getUserId(req));
    return this.clockService.advance(clockId, dto);
  }

  // ============= VOWS =============

  @Post('campaigns/:id/vows')
  async createVow(
    @Req() req: AuthRequest,
    @Param('id') campaignId: string,
    @Body() dto: CreateVowDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.vowService.create(campaignId, dto);
  }

  @Get('campaigns/:id/vows')
  async listVows(
    @Req() req: AuthRequest,
    @Param('id') campaignId: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.vowService.listByCampaign(campaignId);
  }

  @Patch('vows/:vowId')
  async updateVow(
    @Req() req: AuthRequest,
    @Param('vowId') vowId: string,
    @Body() dto: UpdateVowDto,
  ) {
    const vow = await this.vowService.getById(vowId);
    await this.campaignService.ensureDmOwnership(vow.campaignId, getUserId(req));
    return this.vowService.update(vowId, dto);
  }

  @Post('vows/:vowId/fulfill')
  async fulfillVow(
    @Req() req: AuthRequest,
    @Param('vowId') vowId: string,
  ) {
    const vow = await this.vowService.getById(vowId);
    await this.campaignService.ensureDmOwnership(vow.campaignId, getUserId(req));
    return this.vowService.fulfill(vowId);
  }

  // ============= NARRATIVE DECISIONS =============

  @Post('campaigns/:id/narrative-decisions')
  async createDecision(
    @Req() req: AuthRequest,
    @Param('id') campaignId: string,
    @Body() dto: CreateNarrativeDecisionDto,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.decisionService.create(campaignId, dto);
  }

  @Get('campaigns/:id/narrative-decisions')
  async listDecisions(
    @Req() req: AuthRequest,
    @Param('id') campaignId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.decisionService.listByCampaign(campaignId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('campaigns/:id/narrative-decisions/top')
  async topDecisions(
    @Req() req: AuthRequest,
    @Param('id') campaignId: string,
    @Query('limit') limit?: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.decisionService.top(campaignId, limit ? parseInt(limit, 10) : 5);
  }

  // ============= LORE ENTRIES =============

  @Post('campaigns/:id/lore-entries')
  async createLore(
    @Req() req: AuthRequest,
    @Param('id') campaignId: string,
    @Body() dto: CreateLoreEntryDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.loreService.create(campaignId, dto);
  }

  @Get('campaigns/:id/lore-entries')
  async listLore(
    @Req() req: AuthRequest,
    @Param('id') campaignId: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.loreService.listByCampaign(campaignId);
  }

  // ============= VOICE PROFILES (library) =============

  @Get('library/voice-profiles')
  async listVoices() {
    return this.voiceService.listAll();
  }

  @Get('library/voice-profiles/:id')
  async getVoice(@Param('id') id: string) {
    return this.voiceService.getById(id);
  }
}
