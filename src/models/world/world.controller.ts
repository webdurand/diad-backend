import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CampaignService } from './services/campaign.service';
import { LocationService } from './services/location.service';
import { NpcService } from './services/npc.service';
import { FactionService } from './services/faction.service';
import { QuestService } from './services/quest.service';
import type {
  CreateCampaignDto,
  UpdateCampaignDto,
  InitializeBudgetDto,
  UpdateBudgetDto,
} from './services/campaign.service';
import type { CreateLocationDto, UpdateLocationDto, AddConnectionDto } from './services/location.service';
import type { CreateNpcDto, AddRelationshipDto } from './services/npc.service';
import type { CreateFactionDto, SetFactionRelationDto } from './services/faction.service';
import type { CreateQuestDto, UpdateQuestDto } from './services/quest.service';

interface AuthRequest extends Request {
  user?: { id: string; email: string; name?: string; username?: string };
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException('Usuario nao autenticado.');
  return id;
}

@Controller('campaigns')
@UseGuards(AuthGuard)
export class WorldController {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly locationService: LocationService,
    private readonly npcService: NpcService,
    private readonly factionService: FactionService,
    private readonly questService: QuestService,
  ) {}

  // ==================== CAMPAIGNS ====================

  @Post()
  async createCampaign(@Req() req: AuthRequest, @Body() dto: CreateCampaignDto) {
    return this.campaignService.create(getUserId(req), dto);
  }

  @Get()
  async listCampaigns(@Req() req: AuthRequest) {
    return this.campaignService.listByUser(getUserId(req));
  }

  @Get('invite/:code')
  async getByInviteCode(@Param('code') code: string) {
    return this.campaignService.getByInviteCode(code);
  }

  @Get(':id')
  async getCampaign(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.campaignService.getById(id);
  }

  @Patch(':id')
  async updateCampaign(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.campaignService.update(id, dto);
  }

  // ==================== Spec 014 M1: BOUNDED WORLD ====================

  @Post(':id/initialize-with-budget')
  async initializeWithBudget(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: InitializeBudgetDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.campaignService.initializeWithBudget(id, dto);
  }

  @Get(':id/budget')
  async getBudget(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.campaignService.getBudget(id);
  }

  @Patch(':id/budget')
  async updateBudget(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.campaignService.updateBudget(id, dto);
  }

  @Get(':id/players')
  async getPlayers(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.campaignService.getPlayers(id);
  }

  @Post(':id/players')
  async addPlayer(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { userId?: string; characterId?: string },
  ) {
    const userId = body.userId ?? getUserId(req);
    return this.campaignService.addPlayer(id, userId, body.characterId);
  }

  @Patch(':id/players/:userId')
  async setPlayerCharacter(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body('characterId') characterId: string,
  ) {
    return this.campaignService.setPlayerCharacter(id, userId, characterId);
  }

  @Delete(':id/players/:userId')
  async removePlayer(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.campaignService.removePlayer(id, userId);
  }

  // ==================== LOCATIONS ====================

  @Post(':id/locations')
  async createLocation(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: CreateLocationDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.locationService.create(id, dto);
  }

  @Get(':id/locations')
  async getLocationTree(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.locationService.getTree(id);
  }

  @Patch(':id/locations/:locId')
  async updateLocation(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('locId') locId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.locationService.update(locId, dto);
  }

  @Delete(':id/locations/:locId')
  async removeLocation(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('locId') locId: string,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.locationService.remove(locId);
  }

  @Post(':id/locations/:locId/visit')
  async markLocationVisited(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('locId') locId: string,
  ) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.locationService.markVisited(locId);
  }

  @Get(':id/locations/:locId/connections')
  async getConnections(
    @Param('locId') locId: string,
  ) {
    return this.locationService.getConnections(locId);
  }

  @Post(':id/locations/:locId/connections')
  async addConnection(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('locId') locId: string,
    @Body() dto: AddConnectionDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.locationService.addConnection(locId, dto);
  }

  // ==================== NPCS ====================

  @Post(':id/npcs')
  async createNpc(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: CreateNpcDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.npcService.create(id, dto);
  }

  @Get(':id/npcs')
  async listNpcs(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.npcService.listByCampaign(id);
  }

  @Get(':id/npcs/:npcId')
  async getNpc(@Req() req: AuthRequest, @Param('id') id: string, @Param('npcId') npcId: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.npcService.getById(npcId);
  }

  @Patch(':id/npcs/:npcId')
  async updateNpc(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('npcId') npcId: string,
    @Body() dto: Partial<CreateNpcDto>,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.npcService.update(npcId, dto);
  }

  @Delete(':id/npcs/:npcId')
  async removeNpc(@Req() req: AuthRequest, @Param('id') id: string, @Param('npcId') npcId: string) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.npcService.remove(npcId);
  }

  @Post(':id/npcs/:npcId/relationships')
  async addRelationship(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('npcId') npcId: string,
    @Body() dto: AddRelationshipDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.npcService.addRelationship(npcId, dto);
  }

  @Patch(':id/npcs/:npcId/move')
  async moveNpc(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('npcId') npcId: string,
    @Body('locationId') locationId: string | null,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.npcService.moveNpc(npcId, locationId);
  }

  // ==================== FACTIONS ====================

  @Post(':id/factions')
  async createFaction(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: CreateFactionDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.factionService.create(id, dto);
  }

  @Get(':id/factions')
  async listFactions(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.factionService.listByCampaign(id);
  }

  @Patch(':id/factions/:facId')
  async updateFaction(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('facId') facId: string,
    @Body() dto: Partial<CreateFactionDto>,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.factionService.update(facId, dto);
  }

  @Post(':id/factions/relations')
  async setFactionRelation(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { factionAId: string } & SetFactionRelationDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.factionService.setRelation(body.factionAId, body);
  }

  @Get(':id/factions/relations')
  async getFactionRelations(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.factionService.getRelations(id);
  }

  // ==================== QUESTS ====================

  @Post(':id/quests')
  async createQuest(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: CreateQuestDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.questService.create(id, dto);
  }

  @Get(':id/quests')
  async listQuests(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('status') status?: string,
  ) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.questService.listByCampaign(id, status);
  }

  @Get(':id/quests/available')
  async getAvailableQuests(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.questService.getAvailableQuests(id);
  }

  @Patch(':id/quests/:qId')
  async updateQuest(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('qId') qId: string,
    @Body() dto: UpdateQuestDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.questService.update(qId, dto);
  }

  @Patch(':id/quests/:qId/objectives/:oId')
  async updateObjectiveStatus(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('oId') oId: string,
    @Body('status') status: string,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.questService.updateObjectiveStatus(oId, status as any);
  }

  @Post(':id/quests/:qId/prerequisites')
  async addPrerequisite(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('qId') qId: string,
    @Body() body: { requiredQuestId: string; requiredStatus?: string },
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.questService.addPrerequisite(qId, body.requiredQuestId, body.requiredStatus);
  }

  @Delete(':id/quests/:qId')
  async removeQuest(@Req() req: AuthRequest, @Param('id') id: string, @Param('qId') qId: string) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.questService.remove(qId);
  }
}
