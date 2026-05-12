import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthRequest } from "../auth/auth.types";
import { CampaignIdPipe } from "./pipes/campaign-id.pipe";
import { CampaignService } from "./services/campaign.service";
import {
  CompanionTemplateService,
  type CreateCompanionTemplateDto,
  type ForgeCompanionTemplateDto,
  type UpdateCompanionTemplateDto,
} from "./services/companion-template.service";

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException("Usuario nao autenticado.");
  return id;
}

@Controller("campaigns/:id/companion-templates")
@UseGuards(AuthGuard)
export class CompanionTemplatesController {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly companionTemplateService: CompanionTemplateService,
  ) {}

  @Get()
  async list(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.companionTemplateService.list(campaignId);
  }

  @Post()
  async create(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() dto: CreateCompanionTemplateDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.companionTemplateService.create(campaignId, dto);
  }

  @Post("forge")
  async forge(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() dto: ForgeCompanionTemplateDto,
  ) {
    const userId = getUserId(req);
    await this.campaignService.ensureDmOwnership(campaignId, userId);
    return this.companionTemplateService.forge(campaignId, dto, userId);
  }

  @Patch(":templateId")
  async update(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Param("templateId") templateId: string,
    @Body() dto: UpdateCompanionTemplateDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.companionTemplateService.update(campaignId, templateId, dto);
  }

  @Delete(":templateId")
  async remove(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Param("templateId") templateId: string,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    await this.companionTemplateService.remove(campaignId, templateId);
    return { ok: true };
  }
}
