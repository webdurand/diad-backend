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
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CampaignService } from "./services/campaign.service";
import { LocationService } from "./services/location.service";
import { NpcService } from "./services/npc.service";
import { FactionService } from "./services/faction.service";
import { QuestService } from "./services/quest.service";
import {
  StoryArcService,
  type CreateStoryArcDto,
  type UpdateStoryArcDto,
} from "./services/story-arc.service";
import {
  NpcRelationshipService,
  type CreateNpcRelationshipDto,
  type UpdateNpcRelationshipDto,
} from "./services/npc-relationship.service";
// Spec 019 — Living World & Ambiance
import { AmbianceService } from "./services/ambiance.service";
import { WeatherService, type Biome } from "./services/weather.service";
import { GameClockService } from "./services/game-clock.service";
import {
  ChaosFactorService,
  type ChaosSource,
} from "./services/chaos-factor.service";
import { Headers } from "@nestjs/common";
import type {
  CreateCampaignDto,
  UpdateCampaignDto,
  InitializeBudgetDto,
  UpdateBudgetDto,
} from "./services/campaign.service";
import type {
  CreateLocationDto,
  UpdateLocationDto,
  AddConnectionDto,
} from "./services/location.service";
import type { CreateNpcDto } from "./services/npc.service";
import { isDmOmniscient } from "./services/npc-projection";
import type { CreateFactionDto } from "./services/faction.service";
import type { CreateQuestDto, UpdateQuestDto } from "./services/quest.service";
// Spec 027 (M2, AC2.10 / bug D3) — resolve slug-ou-UUID em `:id`.
import { CampaignIdPipe } from "./pipes/campaign-id.pipe";

interface AuthRequest extends Request {
  user?: { id: string; email: string; name?: string; username?: string };
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException("Usuario nao autenticado.");
  return id;
}

/** W3C traceparent: `00-<32hex traceId>-<16hex spanId>-<flags>`. */
function extractTraceId(traceparent: string | undefined): string | undefined {
  if (!traceparent) return undefined;
  const parts = traceparent.split("-");
  if (parts.length < 4) return undefined;
  const traceId = parts[1];
  if (!/^[0-9a-f]{32}$/.test(traceId)) return undefined;
  return traceId;
}

interface RollWeatherBody {
  biome: Biome;
  sceneId?: string | null;
}

interface AdvanceClockBody {
  hours: number;
  trigger?: "scene_transition" | "long_rest" | "combat_ended" | "manual_tool";
}

interface SetChaosBody {
  value: number;
  source: ChaosSource;
}

@Controller("campaigns")
@UseGuards(AuthGuard)
export class WorldController {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly locationService: LocationService,
    private readonly npcService: NpcService,
    private readonly factionService: FactionService,
    private readonly questService: QuestService,
    // Spec 019 — Living World & Ambiance
    private readonly ambianceService: AmbianceService,
    private readonly weatherService: WeatherService,
    private readonly gameClockService: GameClockService,
    private readonly chaosFactorService: ChaosFactorService,
    // Spec NNN — Mundo + Aventura (story arcs + NPC relationships)
    private readonly storyArcService: StoryArcService,
    private readonly npcRelationshipService: NpcRelationshipService,
  ) {}

  // ==================== AMBIANCE (Spec 019) ====================

  /**
   * Spec 019 — payload agregado consumido pelo agent (`get_ambiance`) e
   * frontend (`useAmbiancePill`). Inclui weather, timeOfDay (derivado),
   * chaosFactor, clocks visíveis e summary narrativo PT-BR.
   */
  @Get(":id/ambiance")
  async getAmbiance(
    @Param("id", CampaignIdPipe) campaignId: string,
    @Query("sceneId") sceneId?: string,
  ) {
    return this.ambianceService.assemble(campaignId, sceneId ?? null);
  }

  @Post(":id/weather/roll")
  async rollWeather(
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: RollWeatherBody,
    @Headers("traceparent") traceparent?: string,
  ) {
    const traceId = extractTraceId(traceparent);
    const row = await this.weatherService.rollWeather(
      campaignId,
      body.biome,
      { sceneId: body.sceneId ?? null, traceId },
    );
    return this.weatherService.toDto(row);
  }

  @Post(":id/clock/advance")
  async advanceClock(
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: AdvanceClockBody,
    @Headers("traceparent") traceparent?: string,
  ) {
    const traceId = extractTraceId(traceparent);
    const result = await this.gameClockService.advanceTime(campaignId, {
      hours: body.hours,
      trigger: body.trigger,
      traceId,
    });
    return {
      campaignId,
      currentInGameDateTime: result.clock.currentInGameDateTime.toISOString(),
      daysPassed: result.clock.daysPassed,
      timeOfDay: result.timeOfDay,
      previousTimeOfDay: result.previousTimeOfDay,
    };
  }

  /**
   * Spec 019 — DM-only. `source` deve ser `director` ou `event` (decisão
   * 2026-04-27: chaos não tem slider pra player).
   */
  @Patch(":id/chaos")
  async setChaos(
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: SetChaosBody,
    @Headers("traceparent") traceparent?: string,
  ) {
    const traceId = extractTraceId(traceparent);
    return this.chaosFactorService.setChaosFactor(
      campaignId,
      body.value,
      body.source,
      { traceId },
    );
  }

  // ==================== CAMPAIGNS ====================

  @Post()
  async createCampaign(
    @Req() req: AuthRequest,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignService.create(getUserId(req), dto);
  }

  @Get()
  async listCampaigns(@Req() req: AuthRequest) {
    return this.campaignService.listByUser(getUserId(req));
  }

  @Get("invite/:code")
  async getByInviteCode(@Param("code") code: string) {
    return this.campaignService.getByInviteCode(code);
  }

  @Get(":id")
  async getCampaign(@Req() req: AuthRequest, @Param("id", CampaignIdPipe) id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.campaignService.getById(id);
  }

  @Patch(":id")
  async updateCampaign(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.campaignService.update(id, dto);
  }

  // ==================== Spec NNN: Mundo + Aventura ====================

  /**
   * Lista paginada de mundos solo (dm_mode='ai') do user.
   * Usado em /jogar/preparar mode='pick_world'.
   * Default: só publicados (isDraft=false).
   */
  @Get("solo/list")
  async listSoloWorlds(
    @Req() req: AuthRequest,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("draft") draft?: string,
  ) {
    const userId = getUserId(req);
    return this.campaignService.listSoloWorlds(userId, {
      q,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      isDraft: draft === "true" ? true : draft === "false" ? false : undefined,
    });
  }

  /**
   * Publica mundo (transição draft → published). Usado no submit final do wizard.
   */
  @Post(":id/publish")
  async publishWorld(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.campaignService.publishWorld(id);
  }

  /**
   * Persiste generation_seed (snapshot do dict do wizard pra replay/audit).
   */
  @Post(":id/generation-seed")
  async setGenerationSeed(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Body() body: { seed: Record<string, unknown> },
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.campaignService.setGenerationSeed(id, body.seed);
  }

  // ==================== Story Arcs (Spec NNN) ====================

  @Post(":id/story-arcs")
  async createStoryArc(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() dto: CreateStoryArcDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.storyArcService.create(campaignId, dto);
  }

  @Get(":id/story-arcs")
  async listStoryArcs(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.storyArcService.listByCampaign(campaignId);
  }

  @Patch(":id/story-arcs/:arcId")
  async updateStoryArc(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Param("arcId") arcId: string,
    @Body() dto: UpdateStoryArcDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.storyArcService.update(arcId, dto);
  }

  @Delete(":id/story-arcs/:arcId")
  async deleteStoryArc(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Param("arcId") arcId: string,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    await this.storyArcService.remove(arcId);
    return { ok: true };
  }

  // ==================== NPC Relationships (Spec NNN) ====================

  @Post(":id/npcs/:npcId/relationships")
  async createNpcRelationship(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Param("npcId") npcId: string,
    @Body() dto: Omit<CreateNpcRelationshipDto, "sourceNpcId">,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.npcRelationshipService.create({
      ...dto,
      sourceNpcId: npcId,
    });
  }

  @Get(":id/npcs/:npcId/relationships")
  async listNpcRelationships(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Param("npcId") npcId: string,
  ) {
    await this.campaignService.ensureMembership(campaignId, getUserId(req));
    return this.npcRelationshipService.listBySourceNpc(npcId);
  }

  @Patch(":id/npcs/:npcId/relationships/:relId")
  async updateNpcRelationship(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Param("relId") relId: string,
    @Body() dto: UpdateNpcRelationshipDto,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.npcRelationshipService.update(relId, dto);
  }

  @Delete(":id/npcs/:npcId/relationships/:relId")
  async deleteNpcRelationship(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Param("relId") relId: string,
  ) {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    await this.npcRelationshipService.remove(relId);
    return { ok: true };
  }

  // ==================== Spec 014 M1: BOUNDED WORLD ====================

  @Post(":id/initialize-with-budget")
  async initializeWithBudget(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Body() dto: InitializeBudgetDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.campaignService.initializeWithBudget(id, dto);
  }

  @Get(":id/budget")
  async getBudget(@Req() req: AuthRequest, @Param("id", CampaignIdPipe) id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.campaignService.getBudget(id);
  }

  @Patch(":id/budget")
  async updateBudget(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.campaignService.updateBudget(id, dto);
  }

  @Get(":id/players")
  async getPlayers(@Req() req: AuthRequest, @Param("id", CampaignIdPipe) id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.campaignService.getPlayers(id);
  }

  @Post(":id/players")
  async addPlayer(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Body() body: { userId?: string; characterId?: string },
  ) {
    const userId = body.userId ?? getUserId(req);
    return this.campaignService.addPlayer(id, userId, body.characterId);
  }

  @Patch(":id/players/:userId")
  async setPlayerCharacter(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("userId") userId: string,
    @Body("characterId") characterId: string,
  ) {
    return this.campaignService.setPlayerCharacter(id, userId, characterId);
  }

  @Delete(":id/players/:userId")
  async removePlayer(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("userId") userId: string,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.campaignService.removePlayer(id, userId);
  }

  // ==================== LOCATIONS ====================

  @Post(":id/locations")
  async createLocation(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Body() dto: CreateLocationDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.locationService.create(id, dto);
  }

  @Get(":id/locations")
  async getLocationTree(@Req() req: AuthRequest, @Param("id", CampaignIdPipe) id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.locationService.getTree(id);
  }

  @Patch(":id/locations/:locId")
  async updateLocation(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("locId") locId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.locationService.update(locId, dto);
  }

  @Delete(":id/locations/:locId")
  async removeLocation(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("locId") locId: string,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.locationService.remove(locId);
  }

  @Post(":id/locations/:locId/visit")
  async markLocationVisited(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("locId") locId: string,
  ) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.locationService.markVisited(locId);
  }

  @Get(":id/locations/:locId/connections")
  async getConnections(@Param("locId") locId: string) {
    return this.locationService.getConnections(locId);
  }

  @Post(":id/locations/:locId/connections")
  async addConnection(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("locId") locId: string,
    @Body() dto: AddConnectionDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.locationService.addConnection(locId, dto);
  }

  // ==================== NPCS ====================

  @Post(":id/npcs")
  async createNpc(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Body() dto: CreateNpcDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.npcService.create(id, dto);
  }

  @Get(":id/npcs")
  async listNpcs(
    @Req() req: AuthRequest,
    @Headers() headers: Record<string, string>,
    @Param("id", CampaignIdPipe) id: string,
  ) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    // Spec 020 — redaction filter default-on. dm-omniscient bypass via header.
    return this.npcService.listByCampaignProjected(id, {
      dmOmniscient: isDmOmniscient(headers),
    });
  }

  @Get(":id/npcs/:npcId")
  async getNpc(
    @Req() req: AuthRequest,
    @Headers() headers: Record<string, string>,
    @Param("id", CampaignIdPipe) id: string,
    @Param("npcId") npcId: string,
  ) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    // Spec 020 — redaction filter default-on. dm-omniscient bypass via header.
    return this.npcService.getProjectedById(npcId, {
      dmOmniscient: isDmOmniscient(headers),
    });
  }

  @Patch(":id/npcs/:npcId")
  async updateNpc(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("npcId") npcId: string,
    @Body() dto: Partial<CreateNpcDto>,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.npcService.update(npcId, dto);
  }

  @Delete(":id/npcs/:npcId")
  async removeNpc(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("npcId") npcId: string,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.npcService.remove(npcId);
  }

  @Patch(":id/npcs/:npcId/move")
  async moveNpc(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("npcId") npcId: string,
    @Body("locationId") locationId: string | null,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.npcService.moveNpc(npcId, locationId);
  }

  // ==================== FACTIONS ====================

  @Post(":id/factions")
  async createFaction(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Body() dto: CreateFactionDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.factionService.create(id, dto);
  }

  @Get(":id/factions")
  async listFactions(@Req() req: AuthRequest, @Param("id", CampaignIdPipe) id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.factionService.listByCampaign(id);
  }

  @Patch(":id/factions/:facId")
  async updateFaction(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("facId") facId: string,
    @Body() dto: Partial<CreateFactionDto>,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.factionService.update(facId, dto);
  }

  // ==================== QUESTS ====================

  @Post(":id/quests")
  async createQuest(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Body() dto: CreateQuestDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.questService.create(id, dto);
  }

  @Get(":id/quests")
  async listQuests(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Query("status") status?: string,
  ) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.questService.listByCampaign(id, status);
  }

  @Get(":id/quests/available")
  async getAvailableQuests(@Req() req: AuthRequest, @Param("id", CampaignIdPipe) id: string) {
    await this.campaignService.ensureMembership(id, getUserId(req));
    return this.questService.getAvailableQuests(id);
  }

  @Patch(":id/quests/:qId")
  async updateQuest(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("qId") qId: string,
    @Body() dto: UpdateQuestDto,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.questService.update(qId, dto);
  }

  @Patch(":id/quests/:qId/objectives/:oId")
  async updateObjectiveStatus(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("oId") oId: string,
    @Body("status") status: string,
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.questService.updateObjectiveStatus(oId, status as any);
  }

  /**
   * Spec NNN — Director chama via service-key pra revelar quest após cena.
   * Idempotente: 2ª chamada após reveal retorna alreadyRevealed=true.
   * Dispara EventBus quest_revealed → frontend mostra modal.
   */
  @Post(":id/quests/:slug/reveal")
  async revealQuest(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("slug") slug: string,
    @Body() body: { evidence?: string },
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.questService.revealQuest(id, slug, body.evidence ?? null);
  }

  /**
   * Spec NNN — Director chama pra avançar objetivo após inferir da cena.
   * Auto-completa quest se todos required objectives done. Dispara
   * EventBus quest_advanced (+ quest_completed se cascade fechou).
   */
  @Post(":id/quests/:slug/advance-objective")
  async advanceObjective(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) id: string,
    @Param("slug") slug: string,
    @Body()
    body: {
      objectiveIdx: number;
      newStatus: "completed" | "failed";
      evidence?: string;
    },
  ) {
    await this.campaignService.ensureDmOwnership(id, getUserId(req));
    return this.questService.advanceObjective(
      id,
      slug,
      body.objectiveIdx,
      body.newStatus,
      body.evidence ?? null,
    );
  }
}
