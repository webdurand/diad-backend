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
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Header,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { CloudinaryService } from "src/shared/cloudinary.service";
import { QuestService } from "../world/services/quest.service";
import { CharacterStateService } from "../characters/services/character-state.service";
import { InventoryService } from "../characters/services/inventory.service";
import { EquipmentSourceEnum } from "src/entities/enums";
import { AuthGuard } from "../auth/auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import { NonProductionGuard } from "../auth/non-production.guard";
import { DiceSeedDto } from "./dto/dice-seed.dto";
import { SessionService } from "./services/session.service";
import type {
  CreateSessionDto,
  UpdateSessionDto,
} from "./services/session.service";
import { EncounterService } from "./services/encounter.service";
import type {
  CreateEncounterDto,
  AddMonsterDto,
  BatchPositionDto,
} from "./services/encounter.service";
import { CombatService } from "./services/combat.service";
import type {
  AttackDto,
  DamageDto,
  HealDto,
  ConditionDto,
} from "./services/combat.service";
import { EventService } from "./services/event.service";
import {
  MovementService,
  reconcileRemainingMovement,
} from "./services/movement.service";
import { PersistentAreaService } from "./services/persistent-area.service";
import { SpellCastingService } from "./services/spell-casting.service";
import { DiceService } from "./services/dice.service";
import { SkillCheckService } from "./services/skill-check.service";
import type { SkillCheckDto } from "./services/skill-check.service";
import { SavingThrowService } from "./services/saving-throw.service";
import type { SavingThrowDto } from "./services/saving-throw.service";
import { PermissionResolver } from "./services/permission-resolver.service";
import { DeathSaveDto } from "./dto/death-save.dto";
import { GenericActionDto } from "./dto/generic-action.dto";
import { GenericActionsService } from "./services/generic-actions.service";
import { ClassFeatureExecutorService } from "./services/class-feature-executor.service";
import { FightingStyleReactionsService } from "./services/fighting-style-reactions.service";
import { TacticalFeaturesService } from "./services/tactical-features.service";
import { BattleMasterService } from "./services/battle-master.service";
import { BrutalStrikeService } from "./services/brutal-strike.service";
import { BarbarianFeaturesService } from "./services/barbarian-features.service";
import { BerserkerService } from "./services/berserker.service";
import { ClericFeaturesService } from "./services/cleric-features.service";
import { PaladinFeaturesService } from "./services/paladin-features.service";
import { SorcererFeaturesService } from "./services/sorcerer-features.service";
import { TransformationService } from "./services/transformation.service";
import { SummoningService } from "./services/summoning.service";
import { MarkTransferService } from "./services/mark-transfer.service";
import { OpportunityAttackService } from "./services/opportunity-attack.service";
import { ReadyActionService } from "./services/ready-action.service";
import { AarakocraRitualService } from "./services/aarakocra-ritual.service";
import { CapstonesService } from "./services/capstones.service";
import { AiTurnService } from "./services/ai-turn.service";
import { EncounterSnapshotService } from "./services/encounter-snapshot.service";
import { UpdateControlDto } from "./dto/update-control.dto";

import { LegendaryActionDto } from "./dto/legendary-action.dto";
import { GrappleEscapeDto } from "./dto/grapple-escape.dto";
import { LairActionDto } from "./dto/lair-action.dto";
import { LegendaryActionService } from "./services/legendary-action.service";
import { GrappleEscapeService } from "./services/grapple-escape.service";
import { LairActionService } from "./services/lair-action.service";
import { ConditionLifecycleService } from "./services/condition-lifecycle.service";
import { ConcentrationService } from "./services/concentration.service";

import { JoinRequestService } from "./services/join-request.service";

import { FateLadderService } from "./services/fate-ladder.service";
import type {
  FateLadderTrigger,
  FateLadderOption,
} from "./services/fate-ladder.service";
import { XpAwardService } from "./services/xp-award.service";
import { DiceRollService } from "./services/dice-roll.service";
import type { XpAwardSource } from "src/entities/xp-award-event.entity";

import { RevivifyCheckService } from "./services/revivify-check.service";
import { DyingStateService } from "./services/dying-state.service";
import type { DyingState, DyingReason } from "./services/dying-state.service";
import { LootRollService } from "./services/loot-roll.service";
import type { CRBand, LootMode } from "./services/loot-roll.service";
import { StartEncounterFromNarrativeService } from "./services/start-encounter-from-narrative.service";
import { MoveToLocationService } from "./services/move-to-location.service";
import { MoveToPoiService } from "./services/move-to-poi.service";
import { TravelTickService } from "./services/travel-tick.service";
import {
  TravelActionService,
  type TravelActionInput,
} from "./services/travel-action.service";
import { DialogueActionService } from "./services/dialogue-action.service";
import { ScenePoiObservationService } from "./services/scene-poi-observation.service";

import { RealtimeService } from "src/realtime/realtime.service";
import { StartEncounterFromNarrativeDto } from "./dto/start-encounter-from-narrative.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { failure, GameErrorCode } from "./interfaces/result.type";

import { toEnrichedEncounterResponse } from "./dto/encounter-response.dto";
import {
  toEventResponseDto,
  buildParticipantsMap,
  camelToSnakeCase,
} from "./dto/event-response.dto";
import {
  GetEventsQueryDto,
  VALID_EVENT_TYPES,
} from "./dto/get-events-query.dto";
import { ResolveEncounterDto } from "./dto/resolve-encounter.dto";
import {
  MovementLockService,
  type MovementLockSource,
} from "../session/services/movement-lock.service";

interface AuthRequest extends Request {
  user?: { id: string; email: string; name?: string; username?: string };
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException("Usuario nao autenticado.");
  return id;
}

@Controller("game")
@UseGuards(AuthGuard)
export class GameEngineController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly encounterService: EncounterService,
    private readonly combatService: CombatService,
    private readonly movementService: MovementService,
    private readonly spellCastingService: SpellCastingService,
    private readonly eventService: EventService,
    private readonly diceService: DiceService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly questService: QuestService,
    private readonly stateService: CharacterStateService,
    private readonly inventoryService: InventoryService,
    private readonly skillCheckService: SkillCheckService,
    private readonly savingThrowService: SavingThrowService,
    private readonly permissionResolver: PermissionResolver,
    private readonly genericActionsService: GenericActionsService,
    private readonly classFeatureExecutor: ClassFeatureExecutorService,
    private readonly fsReactions: FightingStyleReactionsService,
    private readonly tacticalFeatures: TacticalFeaturesService,
    private readonly battleMaster: BattleMasterService,
    private readonly brutalStrike: BrutalStrikeService,
    private readonly barbarianFeatures: BarbarianFeaturesService,
    private readonly berserker: BerserkerService,
    private readonly clericFeatures: ClericFeaturesService,
    private readonly paladinFeatures: PaladinFeaturesService,
    private readonly sorcererFeatures: SorcererFeaturesService,
    private readonly transformationService: TransformationService,
    private readonly summoningService: SummoningService,
    private readonly markTransferService: MarkTransferService,
    private readonly opportunityAttackService: OpportunityAttackService,
    private readonly readyActionService: ReadyActionService,
    private readonly aarakocraRitualService: AarakocraRitualService,
    private readonly capstonesService: CapstonesService,
    private readonly aiTurnService: AiTurnService,
    private readonly snapshotService: EncounterSnapshotService,

    private readonly persistentArea: PersistentAreaService,

    private readonly legendaryActionService: LegendaryActionService,
    private readonly grappleEscapeService: GrappleEscapeService,
    private readonly lairActionService: LairActionService,
    private readonly conditionLifecycle: ConditionLifecycleService,
    private readonly concentrationService: ConcentrationService,

    private readonly joinRequestService: JoinRequestService,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,

    private readonly fateLadderService: FateLadderService,
    private readonly xpAwardService: XpAwardService,

    private readonly diceRollService: DiceRollService,

    private readonly revivifyCheckService: RevivifyCheckService,
    private readonly dyingStateService: DyingStateService,
    private readonly lootRollService: LootRollService,
    private readonly startEncounterFromNarrativeService: StartEncounterFromNarrativeService,
    private readonly moveToLocationService: MoveToLocationService,
    private readonly moveToPoiService: MoveToPoiService,
    private readonly travelTickService: TravelTickService,
    private readonly travelActionService: TravelActionService,
    private readonly dialogueActionService: DialogueActionService,
    private readonly movementLockService: MovementLockService,
    private readonly scenePoiObservationService: ScenePoiObservationService,


    private readonly realtime: RealtimeService,
  ) {}


  private emitEncounterInvalidate(encounterId: string, reason: string): void {
    try {
      this.realtime.emitToRoom(
        `encounter:${encounterId}`,
        "encounter:invalidate",
        { encounterId, reason, at: new Date().toISOString() },
      );
    } catch {

    }
  }




  @Post("spells/revivify-check")
  async revivifyCheck(
    @Req() req: AuthRequest,
    @Body()
    body: {
      characterId: string;
      timeSinceDeathMin: number;
      hasDiamond300gp?: boolean;
      casterCharacterId?: string | null;
      campaignId?: string;
      targetDyingState?: "none" | "dying" | "stable" | "dead" | "captured";
      bodyDestroyed?: boolean;
    },
  ) {
    void req;
    const result = await this.revivifyCheckService.check({
      characterId: body.characterId,
      timeSinceDeathMin: body.timeSinceDeathMin,
      hasDiamond300gp: body.hasDiamond300gp,
      casterCharacterId: body.casterCharacterId,
      campaignId: body.campaignId,
      targetDyingState: body.targetDyingState,
      bodyDestroyed: body.bodyDestroyed,
    });
    return { ok: true as const, value: result };
  }


  @Patch("encounters/:id/participants/:pid/dying-state")
  async setDyingState(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("pid") participantId: string,
    @Body()
    body: {
      state: DyingState;
      reason: DyingReason;
      narrativeDescriptor?: string;
      campaignId?: string;
    },
  ) {
    void req;
    const result = await this.dyingStateService.setState({
      participantId,
      state: body.state,
      reason: body.reason,
      narrativeDescriptor: body.narrativeDescriptor,
      encounterId,
      campaignId: body.campaignId,
    });
    return { ok: true as const, value: result };
  }


  @Post("loot/roll")
  async rollLootTable(
    @Req() req: AuthRequest,
    @Body()
    body: {
      campaignId: string;
      tableSlug?: string;
      crBand?: CRBand;
      monsterSlug?: string;
      hoardOrIndividual?: LootMode;
      awardToCharacterId?: string | null;
    },
  ) {
    void req;
    const result = await this.lootRollService.roll(body);
    return { ok: true as const, value: result };
  }


  @Post("sessions/:sessionId/encounters/from-narrative")
  async startEncounterFromNarrative(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Body() dto: StartEncounterFromNarrativeDto,
  ) {
    const ownerUserId = getUserId(req);
    const result = await this.startEncounterFromNarrativeService.run({
      sessionId,
      sceneId: dto.sceneId,
      attackerParticipantId: dto.attackerParticipantId ?? null,
      targetNpcIds: dto.targetNpcIds,
      targets: dto.targets,
      surpriseRound: dto.surpriseRound ?? false,
      autoPlaceTokens: dto.autoPlaceTokens ?? true,
      narrativeTrigger: dto.narrativeTrigger,
      campaignId: dto.campaignId,
      tokensLayout: dto.tokensLayout,
      ownerUserId,
    });
    return { ok: true as const, value: result };
  }


  @Post("sessions/:sessionId/move-to-location")
  async moveToLocation(
    @Param("sessionId") sessionId: string,
    @Body()
    dto: {
      targetLocationId?: string;
      targetLocationName?: string;
      reason?: string;
    },
  ) {
    const result = await this.moveToLocationService.run({
      sessionId,
      targetLocationId: dto.targetLocationId,
      targetLocationName: dto.targetLocationName,
      reason: dto.reason,
    });
    return { ok: true as const, value: result };
  }


  @Post("sessions/:sessionId/move-to-poi")
  async moveToPoi(
    @Param("sessionId") sessionId: string,
    @Body()
    dto: {
      targetPoiId?: string;
      targetPoiName?: string;
      reason?: string;
    },
  ) {
    const result = await this.moveToPoiService.run({
      sessionId,
      targetPoiId: dto.targetPoiId,
      targetPoiName: dto.targetPoiName,
      reason: dto.reason,
    });
    return { ok: true as const, value: result };
  }


  @Post("sessions/:sessionId/travel/resolve")
  async resolveTravel(
    @Param("sessionId") sessionId: string,
    @Body()
    dto: {
      targetLocationId?: string;
      targetLocationName?: string;
    },
  ) {
    const result = await this.moveToLocationService.resolveTravel({
      sessionId,
      targetLocationId: dto.targetLocationId,
      targetLocationName: dto.targetLocationName,
    });
    return { ok: true as const, value: result };
  }


  @Get("sessions/:sessionId/available-travels")
  async availableTravels(@Param("sessionId") sessionId: string) {
    const travels =
      await this.moveToLocationService.listAvailableTravels(sessionId);
    return { ok: true as const, value: travels };
  }

  @Get("sessions/:sessionId/world/reachable-locations")
  async reachableLocations(@Param("sessionId") sessionId: string) {
    const locations =
      await this.moveToLocationService.listReachableLocations(sessionId);
    return { ok: true as const, value: locations };
  }

  @Get("sessions/:sessionId/world/poi-observation")
  async poiObservation(
    @Param("sessionId") sessionId: string,
    @Query("poiId") poiId: string,
    @Query("force") force?: string,
  ) {
    const observation = await this.scenePoiObservationService.findOrGenerate({
      sessionId,
      poiId,
      force: force === "true" || force === "1",
    });
    return { ok: true as const, value: observation };
  }


  @Get("sessions/:sessionId/available-pois")
  async availablePois(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
  ) {
    const pois = await this.moveToPoiService.listAvailablePois(
      sessionId,
      getUserId(req),
    );
    return { ok: true as const, value: pois };
  }

  @Patch("sessions/:sessionId/movement-lock")
  async setMovementLock(
    @Param("sessionId") sessionId: string,
    @Body()
    dto: {
      active?: boolean;
      reason?: string;
      exitActionLabel?: string;
      interlocutorNpcId?: string | null;
      source?: MovementLockSource;
    },
  ) {
    const movementLock = await this.movementLockService.setForActiveScene(
      sessionId,
      dto,
    );
    return { ok: true as const, value: { movementLock } };
  }

  @Post("sessions/:sessionId/dialogue/start")
  async startDialogue(
    @Param("sessionId") sessionId: string,
    @Body()
    dto: {
      npcId: string;
      reason?: string;
    },
  ) {
    const result = await this.dialogueActionService.start(sessionId, dto);
    return { ok: true as const, value: result };
  }

  @Post("sessions/:sessionId/dialogue/exit")
  async exitDialogue(@Param("sessionId") sessionId: string) {
    const result = await this.dialogueActionService.exit(sessionId);
    return { ok: true as const, value: result };
  }

  @Post("sessions/:sessionId/dialogue/skill-roll")
  async registerDialogueSkillRoll(
    @Param("sessionId") sessionId: string,
    @Body() dto: { actionId: string },
  ) {
    const result = await this.dialogueActionService.registerSkillRoll(
      sessionId,
      dto,
    );
    return { ok: true as const, value: result };
  }

  @Post("sessions/:sessionId/dialogue/press")
  async pressDialogue(
    @Param("sessionId") sessionId: string,
    @Body() dto: { npcId?: string; topic?: string },
  ) {
    const result = await this.dialogueActionService.press(sessionId, dto);
    return { ok: true as const, value: result };
  }

  @Post("sessions/:sessionId/travel/tick")
  async tickTravel(@Param("sessionId") sessionId: string) {
    const result = await this.travelTickService.tick(sessionId);
    return { ok: true as const, value: result };
  }

  @Post("sessions/:sessionId/travel/arrive")
  async arriveTravel(@Param("sessionId") sessionId: string) {
    const result = await this.travelTickService.arrive(sessionId);
    return { ok: true as const, value: result };
  }

  @Post("sessions/:sessionId/travel/action")
  async applyTravelAction(
    @Param("sessionId") sessionId: string,
    @Body() dto: TravelActionInput,
  ) {
    const result = await this.travelActionService.apply(sessionId, dto);
    return { ok: true as const, value: result };
  }



  @Post("sessions")
  async createSession(@Req() req: AuthRequest, @Body() dto: CreateSessionDto) {
    return this.sessionService.create(getUserId(req), dto);
  }

  @Get("sessions/solo")
  async listSoloSessions(@Req() req: AuthRequest) {
    const sessions = await this.sessionService.listByUser(getUserId(req));
    return sessions
      .filter((s) => s.name?.startsWith("Solo:"))
      .map((s) => ({
        id: s.id,
        name: s.name.replace("Solo: ", ""),
        status: s.status,
        updatedAt: s.updatedAt,
        createdAt: s.createdAt,
      }));
  }

  @Get("sessions")
  async listSessions(@Req() req: AuthRequest) {
    return this.sessionService.listByUser(getUserId(req));
  }

  @Get("sessions/:id")
  async getSession(@Req() req: AuthRequest, @Param("id") id: string) {
    await this.sessionService.ensureAccess(id, getUserId(req));
    return this.sessionService.getById(id);
  }

  @Patch("sessions/:id")
  async updateSession(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    await this.sessionService.ensureOwnership(id, getUserId(req));
    return this.sessionService.update(id, dto);
  }

  @Delete("sessions/:id")
  async deleteSession(@Req() req: AuthRequest, @Param("id") id: string) {
    await this.sessionService.ensureOwnership(id, getUserId(req));
    return this.sessionService.delete(id);
  }

  @Post("sessions/:id/characters")
  async addCharacterToSession(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body("characterId") characterId: string,
  ) {
    await this.sessionService.ensureOwnership(id, getUserId(req));
    return this.sessionService.addCharacter(id, characterId);
  }

  @Delete("sessions/:id/characters/:charId")
  async removeCharacterFromSession(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("charId") charId: string,
  ) {
    await this.sessionService.ensureOwnership(id, getUserId(req));
    return this.sessionService.removeCharacter(id, charId);
  }



  @Post("sessions/:sessionId/encounters")
  async createEncounter(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Body() dto: CreateEncounterDto,
  ) {
    const userId = getUserId(req);
    await this.sessionService.ensureOwnership(sessionId, userId);
    return this.encounterService.create(sessionId, dto, userId);
  }

  @Get("sessions/:sessionId/encounters")
  async listEncounters(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
  ) {
    await this.sessionService.ensureOwnership(sessionId, getUserId(req));
    return this.encounterService.listBySession(sessionId);
  }



  @Get("encounters/:id")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  async getEncounter(@Param("id") id: string) {
    const encounter = await this.encounterService.getById(id, {
      withMonsters: true,
    });
    const areas = await this.persistentArea.listByEncounter(id);
    return {
      ok: true as const,
      value: toEnrichedEncounterResponse(encounter, {
        tileEffects: areas.map((area) => ({
          id: area.id,
          encounterId: area.encounterId,
          sourceSpellSlug: area.sourceSpell,
          sourceParticipantId: area.casterParticipantId,
          effectKind: area.effectKind,
          shapeKind: area.shapeKind,
          originCell: area.originCell,
          radiusCells: area.radiusCells,
          damageDice: area.damageDice,
          damageType: area.damageType,
          durationRoundsRemaining: area.durationRoundsRemaining,
          slotLevel: area.slotLevel,
          saveDc: area.saveDc,
          saveAbility: area.saveAbility,
          isDifficultTerrain: area.isDifficultTerrain,
          speedMultiplier: area.speedMultiplier,
          sourceConcentration: area.sourceConcentration,
          auraFollowsCaster: area.auraFollowsCaster ?? false,
          narrativeDescriptor: area.narrativeDescriptor,
          tactical: area.tacticalMetadata,
        })),
      }),
      events: [],
    };
  }

  @Get("campaigns/:campaignId/encounters")
  async listEncountersByCampaign(@Param("campaignId") campaignId: string) {
    return this.encounterService.listByCampaign(campaignId);
  }

  @Delete("encounters/:id")
  async deleteEncounter(@Param("id") id: string) {
    await this.encounterService.deleteEncounter(id);
    return { ok: true };
  }

  @Post("encounters/:id/monsters")
  async addMonster(@Param("id") id: string, @Body() dto: AddMonsterDto) {
    return this.encounterService.addMonster(id, dto);
  }

  @Post("encounters/:id/characters")
  async addCharacterToEncounter(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body("characterId") characterId: string,
  ) {
    return this.encounterService.addCharacter(id, characterId, getUserId(req));
  }

  @Post("encounters/:id/late-join/character")
  async lateJoinCharacter(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body("characterId") characterId: string,
  ) {
    return this.encounterService.lateJoinCharacter(
      id,
      characterId,
      getUserId(req),
    );
  }



  @Post("encounters/:id/join-requests")
  async createJoinRequest(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body("characterId") characterId: string,
  ) {
    return this.joinRequestService.createRequest(
      id,
      characterId,
      getUserId(req),
    );
  }

  @Get("encounters/:id/join-requests")
  async listJoinRequests(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Query("status") status?: "pending" | "approved" | "rejected" | "all",
  ) {
    return this.joinRequestService.listByEncounter(
      id,
      getUserId(req),
      status ?? "pending",
    );
  }

  @Post("encounters/:id/join-requests/:reqId/approve")
  async approveJoinRequest(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("reqId") reqId: string,
  ) {
    return this.joinRequestService.approve(id, reqId, getUserId(req));
  }

  @Post("encounters/:id/join-requests/:reqId/reject")
  async rejectJoinRequest(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("reqId") reqId: string,
    @Body("reason") reason?: string,
  ) {
    return this.joinRequestService.reject(id, reqId, getUserId(req), reason);
  }

  @Post("encounters/:id/invites")
  async inviteToEncounter(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { playerUserIds?: string[]; message?: string } = {},
  ) {
    return this.joinRequestService.createInvites(
      id,
      getUserId(req),
      body.playerUserIds,
      body.message,
    );
  }

  @Post("encounters/:id/late-join/monster")
  async lateJoinMonster(@Param("id") id: string, @Body() dto: AddMonsterDto) {
    return this.encounterService.lateJoinMonster(id, dto);
  }

  @Delete("encounters/:id/participants/:participantId")
  async removeParticipant(@Param("participantId") participantId: string) {
    return this.encounterService.removeParticipant(participantId);
  }

  @Post("encounters/:id/roll-initiative")
  async rollInitiative(@Param("id") id: string) {
    return this.encounterService.rollAllInitiative(id);
  }

  @Patch("encounters/:id/initiative/:participantId")
  async setManualInitiative(
    @Param("participantId") participantId: string,
    @Body("total") total: number,
  ) {
    return this.encounterService.setManualInitiative(participantId, total);
  }

  @Post("encounters/:id/start")
  async startCombat(@Param("id") id: string, @Req() req: AuthRequest) {
    const encounter = await this.encounterService.startCombat(id);
    const firstId = encounter.turnOrder?.[0];
    if (firstId) {
      const first = await this.encounterService.getParticipant(firstId);
      const session = await this.sessionService.getById(encounter.sessionId);
      const ownerId =
        first.type === "pc" && first.characterId
          ? await this.encounterService.resolveCharacterOwner(
              first.characterId,
              getUserId(req),
              session.campaignId ?? undefined,
            )
          : getUserId(req);
      await this.movementService.initializeTurn(first, ownerId);
    }
    const out = await this.encounterService.getById(id);
    this.emitEncounterInvalidate(id, "start-combat");
    return out;
  }

  @Post("encounters/:id/end")
  async endEncounter(@Param("id") id: string) {
    const result = await this.encounterService.endEncounter(id);
    this.emitEncounterInvalidate(id, "end-encounter");
    return result;
  }


  @Post("encounters/:id/talk-down")
  async talkDownEncounter(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      skill: "Persuasion" | "Deception" | "Intimidation" | "Insight";
      dc: number;
      totalModifier: number;
      rawD20: number;
      rawD20Disadv?: number | null;
    },
  ) {
    const resolved = this.diceService.resolveDiceRoll({
      rollId: "00000000-0000-0000-0000-000000000000",
      rawD20: body.rawD20,
      rawD20Disadv: body.rawD20Disadv ?? null,
      totalModifier: body.totalModifier,
      dc: body.dc,
      kind: "ability_check",
    });

    const succeeded =
      resolved.verdict === "success" || resolved.verdict === "crit_success";




    const xpAwards: Array<{
      characterId: string;
      awardedXp: number;
      eventId: string;
    }> = [];

    if (succeeded) {
      const encounter = await this.encounterService.getById(id, {
        withMonsters: true,
      });

      const totalXp = (encounter.participants ?? [])
        .filter(
          (p) => this.isHostileDefeatable(p) && Boolean(p.monster),
        )
        .reduce((sum, p) => sum + (p.monster?.xp ?? 0), 0);

      const pcParticipants = (encounter.participants ?? []).filter(
        (p) => p.type === "pc" && p.characterId,
      );

      if (totalXp > 0 && pcParticipants.length > 0) {
        const session = await this.sessionService
          .getById(encounter.sessionId)
          .catch(() => null);
        const ownerUserId = getUserId(req);
        const campaignId = session?.campaignId ?? undefined;

        for (const pc of pcParticipants) {
          const result = await this.xpAwardService
            .awardXp({
              characterId: pc.characterId!,
              amount: totalXp,
              source: "combat_resolved_peacefully",
              reason: `Talk-down (${body.skill}) DC ${body.dc} success`,
              encounterId: id,
              ownerUserId,
              campaignId,
              narrativeJustification: `Combate resolvido pacificamente via ${body.skill} check.`,
            })
            .catch(() => null);
          if (result?.ok) {
            xpAwards.push({
              characterId: pc.characterId!,
              awardedXp: result.value.awardedXp,
              eventId: result.value.eventId,
            });
          }
        }
      }

      if (encounter.status === "preparing") {
        await this.encounterService.endEncounter(id).catch(() => {

        });
      }
    }

    return {
      ok: true,
      value: {
        encounterId: id,
        skill: body.skill,
        dc: body.dc,
        verdict: resolved.verdict,
        succeeded,
        outcome: succeeded ? "talked_down" : "failed_initiative_will_roll",
        roll: {
          rawD20: resolved.rawD20,
          rawD20Disadv: resolved.rawD20Disadv,
          total: resolved.total,
        },
        xpAwards,
      },
    };
  }


  @Get("encounters/:id/pre-combat-briefing")
  async preCombatBriefing(@Param("id") encounterId: string) {
    const encounter = await this.encounterService.getById(encounterId, {
      withMonsters: true,
    });

    const monsterParticipants = (encounter.participants ?? []).filter(
      (p) => this.isHostileDefeatable(p) && Boolean(p.monster),
    );

    const monsters = monsterParticipants.map((p) => {
      const ac =
        typeof (p.monster as any)?.armor_class === "object"
          ? Number(
              ((p.monster as any).armor_class.value ??
                (p.monster as any).armor_class.ac ??
                0) as number,
            )
          : Number((p.monster as any).armor_class ?? 0);
      return {
        name: p.monster!.name,
        cr: p.monster!.challenge_rating,
        hpMax: p.monster!.hit_points,
        ac,
      };
    });

    const totalXp = monsterParticipants.reduce(
      (sum, p) => sum + (p.monster?.xp ?? 0),
      0,
    );


    const pcParticipants = (encounter.participants ?? []).filter(
      (p) => p.type === "pc" && p.characterId,
    );
    let partyLevel = 1;
    if (pcParticipants.length > 0) {



      const levels = pcParticipants
        .map((p) => Number((p as any).level ?? (p as any).characterLevel ?? 0))
        .filter((l) => l > 0);
      if (levels.length > 0) {
        partyLevel = Math.round(
          levels.reduce((a, b) => a + b, 0) / levels.length,
        );
      }
    }
    const tier =
      partyLevel >= 17
        ? "tier4"
        : partyLevel >= 11
          ? "tier3"
          : partyLevel >= 5
            ? "tier2"
            : "tier1";



    const talkDownAvailable =
      monsterParticipants.length > 0 &&
      monsterParticipants.every((p) => {
        const m = p.monster!;
        const isHumanoid = m.type?.toLowerCase().includes("humanoid") ?? false;
        const isIntelligent = (m.intelligence ?? 0) >= 8;
        const isEligible = isHumanoid || isIntelligent;
        const isEnraged = (p.conditionInstances ?? []).some(
          (c) =>
            c.slug === ("enraged" as any) || c.slug === ("frenzied" as any),
        );
        const isSummoned = !!p.linkedCasterParticipantId;
        return isEligible && !isEnraged && !isSummoned;
      });

    const rawDc = 10 + partyLevel;
    const talkDownDc = Math.max(5, Math.min(20, rawDc));

    return {
      encounterId,
      monsters,
      totalXp,
      tier,
      talkDownAvailable,
      talkDownDc,
      talkDownSkill: "persuasion",
    };
  }

  private isHostileDefeatable(participant: EncounterParticipantEntity): boolean {
    return (
      participant.faction === "enemy" &&
      participant.controlledBy === "ai" &&
      participant.type !== "pc"
    );
  }


  @Post("encounters/:id/resolve")
  async resolveEncounter(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: ResolveEncounterDto,
  ) {
    const userId = getUserId(req);




    const current = await this.combatService.getCurrentTurn(id);
    if (current.ok && current.value?.participantId) {
      await this.permissionResolver.resolveMutationOwner(
        current.value.participantId,
        userId,
        id,
      );
    }
    return this.encounterService.resolveEncounter(id, body, userId);
  }



  @Get("encounters/:id/turn")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  async getCurrentTurn(@Param("id") id: string) {
    return this.combatService.getCurrentTurn(id);
  }

  @Post("encounters/:id/aoe-action")
  async resolveAoeAction(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      casterParticipantId: string;
      actionName: string;
      affectedParticipantIds: string[];
    },
  ) {


    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.casterParticipantId,
      getUserId(req),
      id,
    );
    return this.combatService.resolveAoeAction(id, {
      ...body,
      ownerUserId,
    });
  }

  @Post("encounters/:id/attack")
  async resolveAttack(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      attackerParticipantId: string;
      targetParticipantId?: string;
      targetParticipantIds?: string[];

      actionSlug?: string;

      actionName?: string;

      options?: Record<string, unknown>;
      forceAdvantage?: boolean;
      forceDisadvantage?: boolean;
    },
  ) {

    if (!body.actionSlug) {
      return {
        ok: false,
        error:
          "Campo 'actionSlug' e obrigatorio. O shape antigo ('actionName') foi removido em Spec 003.",
        code: "MISSING_ACTION_SLUG",
        hint: "Use actionSlug de GET /characters/:id/combat-actions ou GET /encounters/:id/participants/:pid/actions.",
      };
    }

    if (body.actionSlug === "shove" || body.actionSlug === "grapple") {
      return {
        ok: false,
        error: "Shove e Grapple sao sub-opcoes de Unarmed Strike (XPHB 2024).",
        code: "USE_UNARMED_STRIKE",
        hint: `Use actionSlug='unarmed-strike' com options.mode='${body.actionSlug}'.`,
      };
    }




    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.attackerParticipantId,
      getUserId(req),
      id,
    );

    const translated = await this.combatService.translateSlugToActionName(
      id,
      body.attackerParticipantId,
      body.actionSlug,
      ownerUserId,
    );
    if (!translated.ok) return translated;
    const actionName = translated.value;

    const isMultiattack = /multiataque|multiattack/i.test(actionName);
    if (isMultiattack) {
      return this.combatService.resolveMultiattack(id, {
        attackerParticipantId: body.attackerParticipantId,
        targetParticipantId: body.targetParticipantId ?? "",
        targetParticipantIds: body.targetParticipantIds,
        actionName,
        actionSlug: body.actionSlug,
        options: body.options,
        forceAdvantage: body.forceAdvantage,
        forceDisadvantage: body.forceDisadvantage,
        ownerUserId,
      });
    }
    if (!body.targetParticipantId) {
      return {
        ok: false,
        error: "targetParticipantId é obrigatório para ataque simples.",
        code: "INVALID_PAYLOAD",
      };
    }
    return this.combatService.resolveAttack(id, {
      attackerParticipantId: body.attackerParticipantId,
      targetParticipantId: body.targetParticipantId,
      actionName,
      actionSlug: body.actionSlug,
      options: body.options,
      forceAdvantage: body.forceAdvantage,
      forceDisadvantage: body.forceDisadvantage,
      ownerUserId,
    });
  }


  @Post(["encounters/:id/apply-damage", "encounters/:id/damage"])
  async applyDamage(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      targetParticipantId: string;
      amount: number;
      damageType: string;
      fromCriticalHit?: boolean;
    },
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.targetParticipantId,
      getUserId(req),
      id,
    );
    return this.combatService.applyDamage(id, { ...body, ownerUserId });
  }

  @Post("encounters/:id/heal")
  async applyHealing(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { targetParticipantId: string; amount: number },
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.targetParticipantId,
      getUserId(req),
      id,
    );
    return this.combatService.applyHealing(id, { ...body, ownerUserId });
  }

  @Post("encounters/:id/condition")
  async applyCondition(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      participantId: string;
      condition: string;
      apply: boolean;
      durationRoundsRemaining?: number;
    },
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      id,
    );
    return this.combatService.applyCondition(id, { ...body, ownerUserId });
  }





  @Get("encounters/:id/turn-actions/:participantId")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  @Header("Pragma", "no-cache")
  async getTurnActions(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("participantId") participantId: string,
  ) {
    return this.combatService.getTurnActions(id, participantId, getUserId(req));
  }


  @Get("encounters/:id/participants/:participantId/actions")
  async getParticipantActions(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("participantId") participantId: string,
  ) {
    return this.combatService.getParticipantCombatActions(
      id,
      participantId,
      getUserId(req),
    );
  }

  @Post("encounters/:id/end-turn")
  async endTurn(@Req() req: AuthRequest, @Param("id") id: string) {





    const current = await this.combatService.getCurrentTurn(id);
    if (current.ok && current.value?.participantId) {
      await this.permissionResolver.resolveMutationOwner(
        current.value.participantId,
        getUserId(req),
        id,
      );
    }

    const result = await this.combatService.endTurn(id);
    this.emitEncounterInvalidate(id, "end-turn");
    return result;
  }

  @Delete("encounters/:id/conditions/:instanceId")
  async removeConditionInstance(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("instanceId") instanceId: string,
  ) {
    void req;

    const participants = await this.participantRepo.find({
      where: { encounterId: id },
    });
    const target = participants.find((p) =>
      (p.conditionInstances ?? []).some((ci) => ci.id === instanceId),
    );
    if (!target) return failure(GameErrorCode.INVALID_CONDITION_INSTANCE);
    const r = await this.conditionLifecycle.removeConditionInstance(
      target,
      instanceId,
      "manual",
    );
    return {
      ok: true,
      value: { instanceId, removed: r.removed },
      events: r.events,
    };
  }



  @Patch("encounters/:id/participants/:participantId/control")
  async updateControlMode(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("participantId") participantId: string,
    @Body() dto: UpdateControlDto,
  ) {
    const authUserId = getUserId(req);
    return this.encounterService.updateControlMode(
      id,
      participantId,
      dto.mode,
      authUserId,
    );
  }



  @Post("encounters/:id/ai-turn")
  async executeAiTurn(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { participantId: string },
  ) {
    const authUserId = getUserId(req);
    const result = await this.aiTurnService.executeAiTurn(
      id,
      body.participantId,
      authUserId,
    );
    this.emitEncounterInvalidate(id, "ai-turn");
    return result;
  }

  @Get("encounters/:id/snapshot")
  async getEncounterSnapshot(@Req() req: AuthRequest, @Param("id") id: string) {
    const authUserId = getUserId(req);
    return this.snapshotService.build(id, authUserId);
  }



  @Post("encounters/:id/generic-action")
  async executeGenericAction(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: GenericActionDto,
  ) {
    const authUserId = getUserId(req);

    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      dto.participantId,
      authUserId,
      id,
    );
    const result = await this.genericActionsService.execute(id, {
      ...dto,
      ownerUserId,
    });
    if (result.ok && result.events?.length) {
      const encounter = await this.encounterRepo.findOne({ where: { id } });
      if (encounter?.sessionId) {
        await this.eventService.emit(encounter.sessionId, id, result.events);
      }
      this.emitEncounterInvalidate(id, `generic-action:${dto.kind}`);
    }
    return result;
  }

  @Post("encounters/:id/participants/:participantId/concentration/drop")
  async dropConcentration(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("participantId") participantId: string,
  ) {
    const participant =
      await this.encounterService.getParticipant(participantId);
    if (participant.encounterId !== id) {
      return failure("Participante não pertence ao encontro.", "INVALID_TARGET");
    }
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      participantId,
      getUserId(req),
      id,
    );
    if (!participant.isConcentrating) {
      return failure(
        "O participante não está mantendo concentração.",
        "INVALID_ACTION",
      );
    }

    const encounter = await this.encounterService.getById(id);
    const previousSpeed = await this.movementService.getBaseSpeed(
      participant,
      ownerUserId,
    );
    const result = await this.concentrationService.break(participant, "manual");
    const newSpeed = await this.movementService.getBaseSpeed(
      participant,
      ownerUserId,
    );
    if (newSpeed !== previousSpeed) {
      participant.movementRemaining = reconcileRemainingMovement(
        participant.movementRemaining,
        previousSpeed,
        newSpeed,
      );
      await this.participantRepo.save(participant);
      result.events.push({
        event_type: "movement_speed_changed",
        actor_participant_id: participant.id,
        target_participant_id: participant.id,
        data: {
          sourceSpell: participant.concentratingOn ?? "concentração",
          previousSpeed,
          newSpeed,
          movementRemaining: participant.movementRemaining,
        },
      });
    }
    await this.eventService.emit(encounter.sessionId, id, result.events);
    this.emitEncounterInvalidate(id, "concentration-drop");
    return {
      ok: true as const,
      value: {
        participantId,
        spellName: participant.concentratingOn,
        events: result.events,
      },
    };
  }


  @Post("encounters/:id/class-feature")
  async invokeClassFeature(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      participantId: string;
      featureSlug: string;
      [key: string]: unknown;
    },
  ) {
    const authUserId = getUserId(req);
    await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      authUserId,
      id,
    );
    return this.classFeatureExecutor.execute(
      id,
      body.participantId,
      body.featureSlug,
      body,
      authUserId,
    );
  }

  @Post("encounters/:id/death-save/:participantId")
  async resolveDeathSave(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("participantId") participantId: string,
    @Body() _body: DeathSaveDto,
  ) {
    const authUserId = getUserId(req);
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      participantId,
      authUserId,
      id,
    );
    return this.combatService.resolveDeathSave(id, participantId, ownerUserId);
  }



  @Post("encounters/:id/cast-spell")
  async castSpellInCombat(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      participantId: string;
      spellSlug: string;
      slotLevel: number;
      targetParticipantIds?: string[];
      damageType?:
        | "acid"
        | "cold"
        | "fire"
        | "lightning"
        | "poison"
        | "thunder";
      conditionChoice?: "blinded" | "deafened";

      asReaction?: boolean;

      triggerEventId?: string;

      aoeOriginCell?: {
        x: number;
        y: number;
        direction?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
        end?: { x: number; y: number } | null;
        hotSide?: "left" | "right" | null;
      };
      aoeOriginCells?: Array<{ x: number; y: number }>;

      metamagic?: {
        type:
          | "twinned"
          | "quickened"
          | "distant"
          | "heightened"
          | "extended"
          | "subtle";
        targetExtra?: string;
        heightenedTargetId?: string;
      };

      polymorphBeastSlug?: string;

      summonMonsterSlug?: string;

      summonPosition?: { x: number; y: number };

      summonControlMode?: "shared-turn" | "own-initiative" | "ai-controlled";

      summonBeastForm?: "air" | "land" | "water";

      summonElementalForm?: "air" | "earth" | "fire" | "water";

      summonFamiliarForm?:
        | "bat"
        | "cat"
        | "crab"
        | "frog"
        | "hawk"
        | "lizard"
        | "octopus"
        | "owl"
        | "poisonous-snake"
        | "quipper"
        | "rat"
        | "raven"
        | "sea-horse"
        | "spider"
        | "weasel";

      summonFamiliarCreatureType?: "celestial" | "fey" | "fiend";

      deliverThroughFamiliar?: boolean;

      dispelTarget?:
        | { kind: "participant"; participantId: string }
        | { kind: "tile-effect"; areaId: string };
    },
  ) {
    const result = await this.spellCastingService.castSpellInCombat({
      encounterId: id,
      participantId: body.participantId,
      spellSlug: body.spellSlug,
      slotLevel: body.slotLevel,
      targetParticipantIds: Array.isArray(body.targetParticipantIds)
        ? body.targetParticipantIds
        : [],
      ownerUserId: getUserId(req),
      damageType: body.damageType,
      conditionChoice: body.conditionChoice,
      asReaction: body.asReaction,
      triggerEventId: body.triggerEventId,
      aoeOriginCell: body.aoeOriginCell,
      aoeOriginCells: body.aoeOriginCells,
      metamagic: body.metamagic,
      polymorphBeastSlug: body.polymorphBeastSlug,
      summonMonsterSlug: body.summonMonsterSlug,
      summonPosition: body.summonPosition,
      summonControlMode: body.summonControlMode,
      summonBeastForm: body.summonBeastForm,
      summonElementalForm: body.summonElementalForm,
      summonFamiliarForm: body.summonFamiliarForm,
      summonFamiliarCreatureType: body.summonFamiliarCreatureType,
      deliverThroughFamiliar: body.deliverThroughFamiliar,
      dispelTarget: body.dispelTarget,
    });



    if (result.ok && result.events && result.events.length > 0) {
      try {
        const enc = await this.encounterRepo.findOne({ where: { id } });
        if (enc?.sessionId) {
          await this.eventService.emit(enc.sessionId, id, result.events);
        }
      } catch {

      }
    }
    if (result.ok) {
      this.emitEncounterInvalidate(id, "cast-spell");
    }
    return result;
  }

  @Post("encounters/:id/spells/witch-bolt/sustain")
  async sustainWitchBolt(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { participantId: string },
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      id,
    );
    const result = await this.spellCastingService.sustainWitchBolt(
      id,
      body.participantId,
      ownerUserId,
    );
    if (result.ok && result.events?.length) {
      const encounter = await this.encounterRepo.findOne({ where: { id } });
      if (encounter?.sessionId) {
        await this.eventService.emit(encounter.sessionId, id, result.events);
      }
    }
    if (result.ok) {
      this.emitEncounterInvalidate(id, "witch-bolt-sustain");
    }
    return result;
  }

  @Post("encounters/:id/spells/call-lightning/sustain")
  async sustainCallLightning(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      participantId: string;
      originCell: { x: number; y: number };
    },
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      id,
    );
    const result = await this.spellCastingService.sustainCallLightning(
      id,
      body.participantId,
      ownerUserId,
      body.originCell,
    );
    if (result.ok && result.events?.length) {
      const encounter = await this.encounterRepo.findOne({ where: { id } });
      if (encounter?.sessionId) {
        await this.eventService.emit(encounter.sessionId, id, result.events);
      }
    }
    if (result.ok) {
      this.emitEncounterInvalidate(id, "call-lightning-sustain");
    }
    return result;
  }

  @Post("encounters/:id/spells/cloud-of-daggers/relocate")
  async relocateCloudOfDaggers(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      participantId: string;
      originCell: { x: number; y: number };
    },
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      id,
    );
    const result = await this.spellCastingService.relocateCloudOfDaggers(
      id,
      body.participantId,
      ownerUserId,
      body.originCell,
    );
    if (result.ok && result.events.length > 0) {
      const encounter = await this.encounterRepo.findOne({ where: { id } });
      if (encounter?.sessionId) {
        await this.eventService.emit(encounter.sessionId, id, result.events);
      }
    }
    if (result.ok) {
      this.emitEncounterInvalidate(id, "cloud-of-daggers-relocate");
    }
    return result;
  }

  @Post("encounters/:id/spells/conjure-animals/relocate")
  async relocateConjureAnimals(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      participantId: string;
      originCell: { x: number; y: number };
    },
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      id,
    );
    const result = await this.spellCastingService.relocateConjureAnimals(
      id,
      body.participantId,
      ownerUserId,
      body.originCell,
    );
    if (result.ok && result.events.length > 0) {
      const encounter = await this.encounterRepo.findOne({ where: { id } });
      if (encounter?.sessionId) {
        await this.eventService.emit(encounter.sessionId, id, result.events);
      }
    }
    if (result.ok) {
      this.emitEncounterInvalidate(id, "conjure-animals-relocate");
    }
    return result;
  }

  @Post("encounters/:id/spells/spiritual-weapon/relocate")
  async relocateSpiritualWeapon(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      participantId: string;
      originCell: { x: number; y: number };
      targetParticipantId?: string;
    },
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      id,
    );
    const result = await this.spellCastingService.relocateSpiritualWeapon(
      id,
      body.participantId,
      ownerUserId,
      body.originCell,
      body.targetParticipantId,
    );
    if (result.ok && result.events.length > 0) {
      const encounter = await this.encounterRepo.findOne({ where: { id } });
      if (encounter?.sessionId) {
        await this.eventService.emit(encounter.sessionId, id, result.events);
      }
    }
    if (result.ok) {
      this.emitEncounterInvalidate(id, "spiritual-weapon-relocate");
    }
    return result;
  }


  @Post("encounters/:id/participants/:participantId/revert-transformation")
  async revertTransformation(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body()
    body: {
      reason?:
        | "manual"
        | "concentration-broken"
        | "form-hp-zero"
        | "duration-expired";
    },
  ) {
    await this.permissionResolver.resolveMutationOwner(
      participantId,
      getUserId(req),
      encounterId,
    );

    const before = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!before) {
      return {
        ok: false,
        code: "PARTICIPANT_NOT_FOUND",
        error: "Participant não encontrado.",
      };
    }
    if (!before.transformationState) {
      return { ok: true, reverted: false, events: [] };
    }

    const reason = body.reason ?? "manual";




    if (
      reason === "manual" &&
      before.transformationState.source === "wild-shape"
    ) {
      if (before.bonusActionUsed) {
        return {
          ok: false,
          code: "BONUS_ACTION_ALREADY_USED",
          error:
            "Bonus action já foi usada neste turno. Reverter Wild Shape custa bonus action (RAW 2024).",
        };
      }
      before.bonusActionUsed = true;
      await this.participantRepo.save(before);
    }

    const serviceReason =
      reason === "manual"
        ? "player-dismiss"
        : reason === "form-hp-zero"
          ? "hp-zero"
          : reason === "duration-expired"
            ? "duration-end"
            : "concentration-broken";

    const formSlug = before.transformationState.form.monsterSlug ?? null;
    const formName = before.transformationState.form.formName;
    const originalDisplay = before.transformationState.original.displayName;

    await this.transformationService.revertForm(participantId, serviceReason);

    const hpFromState = before.characterId
      ? await this.stateService
          .getCurrentHp(before.characterId)
          .catch(() => null)
      : null;
    const hpAfter = hpFromState ?? before.currentHp ?? 0;

    const events: Array<{ eventType: string; narrativeDescriptor?: string }> = [
      {
        eventType: "transformation_reverted",
        narrativeDescriptor: `${formName} encolhe de volta à forma de ${originalDisplay}.`,
      },
    ];
    if (reason === "concentration-broken") {
      events.unshift({
        eventType: "concentration_broken",
        narrativeDescriptor:
          "A concentração do caster se rompe; a forma se desfaz.",
      });
    }

    return {
      ok: true,
      reverted: true,
      formSlugReverted: formSlug,
      hpAfter,
      events,
    };
  }


  @Post("encounters/:id/participants/:participantId/stroke-of-luck/arm")
  async strokeOfLuckArm(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { kind: "attack" | "check" },
  ) {
    const userId = getUserId(req);
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant) return { ok: false, code: "PARTICIPANT_NOT_FOUND" };
    return this.capstonesService.strokeOfLuckArm(
      participant,
      userId,
      body.kind,
    );
  }


  @Post("encounters/:id/participants/:participantId/holy-nimbus")
  async holyNimbus(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
  ) {
    const userId = getUserId(req);
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant) return { ok: false, code: "PARTICIPANT_NOT_FOUND" };
    return this.capstonesService.holyNimbusCast(participant, userId);
  }


  @Post("encounters/:id/participants/:participantId/eldritch-master")
  async eldritchMaster(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
  ) {
    const userId = getUserId(req);
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant) {
      return { ok: false, code: "PARTICIPANT_NOT_FOUND" };
    }
    return this.capstonesService.eldritchMaster(participant, userId);
  }


  @Post("encounters/:id/opportunity-attack")
  async opportunityAttack(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      attackerParticipantId: string;
      targetParticipantId: string;
      actionSlug?: string;
      actionName?: string;
    },
  ) {
    return this.opportunityAttackService.resolve({
      encounterId: id,
      attackerParticipantId: body.attackerParticipantId,
      targetParticipantId: body.targetParticipantId,
      actionSlug: body.actionSlug,
      actionName: body.actionName,
      ownerUserId: getUserId(req),
    });
  }


  @Post("encounters/:id/transfer-mark")
  async transferMark(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      casterParticipantId: string;
      newTargetParticipantId: string;
      sourceSpellSlug: "hunters-mark" | "hex";
    },
  ) {
    return this.markTransferService.transferMark({
      encounterId: id,
      casterParticipantId: body.casterParticipantId,
      newTargetParticipantId: body.newTargetParticipantId,
      sourceSpellSlug: body.sourceSpellSlug,
      ownerUserId: getUserId(req),
    });
  }



  @Post("encounters/:id/move")
  async moveParticipant(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { participantId: string; targetX: number; targetY: number },
  ) {
    const result = await this.movementService.moveParticipant(
      id,
      body.participantId,
      body.targetX,
      body.targetY,
      getUserId(req),
    );



    if (result.ok && result.events && result.events.length > 0) {
      try {
        result.events.push(
          ...(await this.combatService.applyPersistentAreaDamageEvents(
            id,
            result.events,
            getUserId(req),
          )),
        );
        const enc = await this.encounterRepo.findOne({ where: { id } });
        if (enc?.sessionId) {
          await this.eventService.emit(enc.sessionId, id, result.events);
        }
      } catch {

      }
    }
    return result;
  }

  @Post("encounters/:id/dash")
  async dashAction(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { participantId: string },
  ) {
    return this.movementService.dashAction(
      id,
      body.participantId,
      getUserId(req),
    );
  }

  @Post("encounters/:id/disengage")
  async disengageAction(
    @Param("id") id: string,
    @Body() body: { participantId: string },
  ) {
    return this.movementService.disengageAction(id, body.participantId);
  }

  @Post("encounters/:id/ready-action")
  async readyAction(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body()
    body: {
      reactorParticipantId: string;
      targetParticipantId: string;
    },
  ) {
    const result = await this.readyActionService.resolve({
      encounterId: id,
      reactorParticipantId: body.reactorParticipantId,
      targetParticipantId: body.targetParticipantId,
      ownerUserId: getUserId(req),
    });
    if (result.ok && result.events.length > 0) {
      const encounter = await this.encounterRepo.findOne({ where: { id } });
      if (encounter?.sessionId) {
        await this.eventService.emit(encounter.sessionId, id, result.events);
      }
      this.emitEncounterInvalidate(id, "ready-action");
    }
    return result;
  }

  @Post("encounters/:id/aarakocra-air-elemental-ritual")
  async aarakocraAirElementalRitual(
    @Param("id") id: string,
    @Body() body: { participantId: string },
  ) {
    const result = await this.aarakocraRitualService.perform(
      id,
      body.participantId,
    );
    if (result.ok && result.events.length > 0) {
      const encounter = await this.encounterRepo.findOne({ where: { id } });
      if (encounter?.sessionId) {
        await this.eventService.emit(encounter.sessionId, id, result.events);
      }
      this.emitEncounterInvalidate(id, "aarakocra-air-elemental-ritual");
    }
    return result;
  }

  @Post("encounters/:id/stand-up")
  async standUp(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { participantId: string },
  ) {
    const result = await this.movementService.standUp(
      id,
      body.participantId,
      getUserId(req),
    );
    if (result.ok && result.events && result.events.length > 0) {
      const encounter = await this.encounterRepo.findOne({ where: { id } });
      if (encounter?.sessionId) {
        await this.eventService.emit(encounter.sessionId, id, result.events);
      }
      this.emitEncounterInvalidate(id, "stand-up");
    }
    return result;
  }


  @Patch("encounters/:id/difficult-terrain")
  async setDifficultTerrain(
    @Param("id") id: string,
    @Body() body: { cells: Array<{ x: number; y: number }> },
  ) {
    const encounter = await this.encounterRepo.findOne({ where: { id } });
    if (!encounter) {
      return { ok: false, code: "ENCOUNTER_NOT_FOUND" };
    }
    encounter.mapData = {
      ...(encounter.mapData ?? {}),
      difficultTerrainCells: Array.isArray(body.cells) ? body.cells : [],
    };
    await this.encounterRepo.save(encounter);
    return {
      ok: true,
      value: {
        cellsCount: encounter.mapData.difficultTerrainCells?.length ?? 0,
      },
    };
  }

  @Get("encounters/:id/movement/:participantId")
  async getMovementState(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("participantId") participantId: string,
  ) {
    return this.movementService.getMovementState(
      id,
      participantId,
      getUserId(req),
    );
  }



  @Post("encounters/:id/map/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (/\.(jpg|jpeg|png|webp|gif)$/i.test(file.originalname)) {
          cb(null, true);
        } else {
          cb(new Error("Apenas imagens (jpg, png, webp, gif)"), false);
        }
      },
    }),
  )
  async uploadMapBackground(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const result = await this.cloudinaryService.uploadBuffer(
      file.buffer,
      "maps",
    );
    return this.encounterService.updateMapData(id, {
      backgroundUrl: result.secure_url,
    });
  }

  @Patch("encounters/:id/map")
  async updateMapData(
    @Param("id") id: string,
    @Body()
    body: {
      gridSize?: number;
      gridColumns?: number;
      gridRows?: number;
      gridVisible?: boolean;
      gridColor?: string;
    },
  ) {
    return this.encounterService.updateMapData(id, body);
  }

  @Patch("encounters/:id/participants/positions")
  async batchUpdatePositions(
    @Param("id") id: string,
    @Body("positions") positions: BatchPositionDto[],
  ) {
    return this.encounterService.batchUpdatePositions(id, positions);
  }

  @Patch("encounters/:id/participants/:participantId/position")
  async updateParticipantPosition(
    @Param("participantId") participantId: string,
    @Param("id") encounterId: string,
    @Body() body: { x: number; y: number },
  ) {




    const participant =
      await this.encounterService.getParticipant(participantId);
    const fromX = participant.positionX ?? body.x;
    const fromY = participant.positionY ?? body.y;
    const updated = await this.encounterService.updateParticipantPosition(
      participantId,
      body.x,
      body.y,
    );

    const traversed: Array<{ x: number; y: number }> = [];
    let cx = fromX;
    let cy = fromY;
    while (cx !== body.x) {
      cx += Math.sign(body.x - cx);
      traversed.push({ x: cx, y: cy });
    }
    while (cy !== body.y) {
      cy += Math.sign(body.y - cy);
      traversed.push({ x: cx, y: cy });
    }
    const events: import("./interfaces/result.type").GameEventData[] = [];
    if (traversed.length > 0) {
      try {
        let previousCell = { x: fromX, y: fromY };
        for (const cell of traversed) {
          const r = await this.persistentArea.resolveEntry(
            updated,
            cell,
            updated.encounterId,
            undefined,
            undefined,
            previousCell,
          );
          events.push(...r.events);
          previousCell = cell;
        }
        const through = await this.persistentArea.resolveMoveThrough(
          updated,
          traversed,
          updated.encounterId,
        );
        events.push(...through.events);
        await this.persistentArea.relocateAurasByCaster(updated.id, {
          x: body.x,
          y: body.y,
        });
      } catch {

      }
    }
    events.push(
      ...(await this.persistentArea.removeLocationBoundConditionsOutsideAreas(
        updated,
        { x: body.x, y: body.y },
      )),
    );
    if (events.length > 0) {
      try {
        const enc = await this.encounterRepo.findOne({
          where: { id: encounterId },
        });
        if (enc?.sessionId) {
          await this.eventService.emit(enc.sessionId, encounterId, events);
        }
      } catch {

      }
    }
    return updated;
  }


  @Post("encounters/:id/participants/:participantId/arm-inspiration")
  async armInspiration(
    @Param("participantId") participantId: string,
    @Body() body: { arm: boolean },
  ) {
    return this.encounterService.armInspiration(participantId, body.arm);
  }

  @Post("encounters/:id/participants/:participantId/grant-inspiration")
  async grantInspiration(
    @Param("participantId") participantId: string,
    @Body() body: { grant: boolean },
  ) {
    return this.encounterService.grantInspiration(participantId, body.grant);
  }


  @Post(
    "encounters/:id/participants/:participantId/fighting-style/interception",
  )
  async fsInterception(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") fighterParticipantId: string,
    @Body() body: { allyParticipantId: string; damageAmount: number },
  ) {
    const userId = getUserId(req);
    const result = await this.fsReactions.interception(
      userId,
      encounterId,
      fighterParticipantId,
      body.allyParticipantId,
      body.damageAmount,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/fighting-style/protection")
  async fsProtection(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") fighterParticipantId: string,
    @Body() body: { allyParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.fsReactions.protection(
      userId,
      encounterId,
      fighterParticipantId,
      body.allyParticipantId,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/tactical-mind")
  async tacticalMind(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { originalCheckTotal: number; dc: number },
  ) {
    const userId = getUserId(req);
    const result = await this.tacticalFeatures.tacticalMind(
      userId,
      encounterId,
      participantId,
      body.originalCheckTotal,
      body.dc,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/maneuver/trip-attack")
  async maneuverTripAttack(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { targetParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.battleMaster.tripAttack(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/maneuver/precision-attack")
  async maneuverPrecisionAttack(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { originalAttackTotal: number },
  ) {
    const userId = getUserId(req);
    const result = await this.battleMaster.precisionAttack(
      userId,
      encounterId,
      participantId,
      body.originalAttackTotal,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/cleric/sear-undead")
  async clericSearUndead(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { targetParticipantIds: string[] },
  ) {
    const userId = getUserId(req);
    const result = await this.clericFeatures.searUndead(
      userId,
      encounterId,
      participantId,
      body.targetParticipantIds,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/paladin/divine-smite")
  async paladinDivineSmite(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body()
    body: {
      targetParticipantId: string;
      slotLevel: number;
      freeCast: boolean;
      decline?: boolean;
    },
  ) {
    const userId = getUserId(req);
    const result = await this.paladinFeatures.divineSmite(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
      body.slotLevel,
      body.freeCast,
      body.decline === true,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/paladin/radiant-strikes")
  async paladinRadiantStrikes(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { targetParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.paladinFeatures.radiantStrikes(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Get("encounters/:id/participants/:participantId/sorcerer/sorcery-points")
  async sorcererGetSorceryPoints(
    @Req() req: AuthRequest,
    @Param("participantId") participantId: string,
  ) {
    const userId = getUserId(req);
    const state = await this.sorcererFeatures.getSorceryPointsState(
      participantId,
      userId,
    );
    return { ok: true, value: state };
  }


  @Post(
    "encounters/:id/participants/:participantId/sorcerer/convert-slot-to-sp",
  )
  async sorcererConvertSlotToSp(
    @Req() req: AuthRequest,
    @Param("participantId") participantId: string,
    @Body() body: { slotLevel: number },
  ) {
    const userId = getUserId(req);
    const result = await this.sorcererFeatures.convertSlotToSp(
      participantId,
      body.slotLevel,
      userId,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value, events: result.events };
  }


  @Post(
    "encounters/:id/participants/:participantId/sorcerer/convert-sp-to-slot",
  )
  async sorcererConvertSpToSlot(
    @Req() req: AuthRequest,
    @Param("participantId") participantId: string,
    @Body() body: { targetSlotLevel: number },
  ) {
    const userId = getUserId(req);
    const result = await this.sorcererFeatures.convertSpToSlot(
      participantId,
      body.targetSlotLevel,
      userId,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value, events: result.events };
  }


  @Post(
    "encounters/:id/participants/:participantId/sorcerer/sorcerous-restoration",
  )
  async sorcererSorcerousRestoration(
    @Req() req: AuthRequest,
    @Param("participantId") participantId: string,
  ) {
    const userId = getUserId(req);
    const result = await this.sorcererFeatures.sorcerousRestoration(
      participantId,
      userId,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value, events: result.events };
  }


  @Post("encounters/:id/participants/:participantId/paladin/sacred-weapon")
  async paladinSacredWeapon(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
  ) {
    const userId = getUserId(req);
    const result = await this.paladinFeatures.sacredWeapon(
      userId,
      encounterId,
      participantId,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/cleric/preserve-life")
  async clericPreserveLife(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body()
    body: { allocations: Array<{ targetParticipantId: string; hp: number }> },
  ) {
    const userId = getUserId(req);
    const result = await this.clericFeatures.preserveLife(
      userId,
      encounterId,
      participantId,
      body.allocations,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/cleric/blessed-strikes")
  async clericBlessedStrikes(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body()
    body: {
      targetParticipantId: string;
      trigger: "melee-hit" | "cantrip-save-failed";
    },
  ) {
    const userId = getUserId(req);
    const result = await this.clericFeatures.blessedStrikes(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
      body.trigger,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/cleric/divine-intervention")
  async clericDivineIntervention(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { spellSlug: string; slotLevel: number },
  ) {
    const userId = getUserId(req);
    const result = await this.clericFeatures.divineIntervention(
      userId,
      encounterId,
      participantId,
      body.spellSlug,
      body.slotLevel,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/berserker/frenzy")
  async berserkerFrenzy(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { targetParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.berserker.frenzy(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/berserker/retaliation")
  async berserkerRetaliation(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { targetParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.berserker.retaliation(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post(
    "encounters/:id/participants/:participantId/berserker/intimidating-presence",
  )
  async berserkerIntimidatingPresence(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { targetParticipantIds: string[] },
  ) {
    const userId = getUserId(req);
    const result = await this.berserker.intimidatingPresence(
      userId,
      encounterId,
      participantId,
      body.targetParticipantIds,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/relentless-rage")
  async barbarianRelentlessRage(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
  ) {
    const userId = getUserId(req);
    const result = await this.barbarianFeatures.relentlessRage(
      userId,
      encounterId,
      participantId,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/indomitable-might")
  async barbarianIndomitableMight(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body()
    body: {
      rawCheckTotal: number;
      abilitySlug: "str" | "dex" | "con" | "int" | "wis" | "cha";
    },
  ) {
    const userId = getUserId(req);
    const result = await this.barbarianFeatures.indomitableMight(
      userId,
      encounterId,
      participantId,
      body.rawCheckTotal,
      body.abilitySlug,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post(
    "encounters/:id/participants/:participantId/brutal-strike/forceful-blow",
  )
  async brutalStrikeForcefulBlow(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { targetParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.brutalStrike.forcefulBlow(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post(
    "encounters/:id/participants/:participantId/brutal-strike/hamstring-blow",
  )
  async brutalStrikeHamstringBlow(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { targetParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.brutalStrike.hamstringBlow(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/tactical-master/arm")
  async tacticalMasterArm(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { masteryOverride: "push" | "sap" | "slow" },
  ) {
    const userId = getUserId(req);
    const result = await this.tacticalFeatures.tacticalMasterArm(
      userId,
      encounterId,
      participantId,
      body.masteryOverride,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }


  @Post("encounters/:id/participants/:participantId/swap-hand")
  async swapHand(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { equipmentId: string; hand: "main" | "off" | null },
  ) {
    const userId = getUserId(req);
    return this.encounterService.swapHand(
      userId,
      encounterId,
      participantId,
      body.equipmentId,
      body.hand,
    );
  }



  @Get("sessions/:id/events")
  async getSessionEvents(
    @Param("id") id: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.eventService.getSessionTimeline(
      id,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get("encounters/:id/events")
  async getEncounterEvents(
    @Param("id") id: string,
    @Query() query: GetEventsQueryDto,
  ) {




    let eventTypes: string[] | undefined;
    if (query.type) {
      const snakeToCamel = (s: string): string =>
        s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      const requestedTypes = query.type.split(",").map((t) => t.trim());
      const normalizedTypes = requestedTypes.map((t) =>
        t.includes("_") ? snakeToCamel(t) : t,
      );
      const invalidTypes = normalizedTypes.filter(
        (t) => !(VALID_EVENT_TYPES as readonly string[]).includes(t),
      );
      if (invalidTypes.length > 0) {
        return failure(
          `Tipo de evento invalido: '${invalidTypes.join("', '")}'. Tipos validos: ${VALID_EVENT_TYPES.slice(0, 10).join(", ")}, ...`,
          "INVALID_PAYLOAD" as GameErrorCode,
        );
      }

      eventTypes = normalizedTypes.map(camelToSnakeCase);
    }

    const { events, total } =
      await this.eventService.getEncounterTimelineFiltered(id, {
        since: query.since,
        eventTypes,
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
        latest: query.latest ?? false,
      });


    const encounter = await this.encounterService.getById(id);
    const participantsMap = buildParticipantsMap(encounter.participants ?? []);

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    return {
      ok: true as const,
      value: {
        events: events.map((e) => toEventResponseDto(e, participantsMap)),
        total,
        hasMore: total > offset + limit,
      },
      events: [],
    };
  }



  @Post("quests/:questId/resolve")
  async resolveQuest(
    @Req() req: AuthRequest,
    @Param("questId") questId: string,
    @Body()
    body: {
      status: "completed" | "failed";
      xpRewards: Array<{ characterId: string; xp: number }>;
      goldRewards: Array<{ characterId: string; gp: number }>;
      itemRewards: Array<{
        characterId: string;
        equipmentId?: string;
        magicItemId?: string;
      }>;
    },
  ) {
    const userId = getUserId(req);


    await this.questService.update(questId, { status: body.status });


    const xpApplied: Array<{
      characterId: string;
      xp: number;
      newTotal: number;
      levelUpAvailable: boolean;
    }> = [];
    for (const reward of body.xpRewards) {
      if (reward.xp <= 0) continue;
      try {
        const result = await this.stateService.updateXp(
          userId,
          reward.characterId,
          { amount: reward.xp },
        );
        xpApplied.push({
          characterId: reward.characterId,
          xp: reward.xp,
          newTotal: result.xp,
          levelUpAvailable: result.levelUpAvailable,
        });
      } catch {}
    }


    const goldApplied: Array<{ characterId: string; gp: number }> = [];
    for (const reward of body.goldRewards) {
      if (reward.gp <= 0) continue;
      try {
        await this.inventoryService.updateGold(userId, reward.characterId, {
          gp: reward.gp,
        });
        goldApplied.push({ characterId: reward.characterId, gp: reward.gp });
      } catch {}
    }


    const itemsApplied: Array<{ characterId: string; itemName: string }> = [];
    for (const reward of body.itemRewards) {
      try {
        if (reward.equipmentId) {
          const result = await this.inventoryService.addItem(
            userId,
            reward.characterId,
            {
              equipmentId: reward.equipmentId,
              source: EquipmentSourceEnum.Loot,
            },
          );
          itemsApplied.push({
            characterId: reward.characterId,
            itemName: (result as any).equipment?.name ?? "Item",
          });
        }
        if (reward.magicItemId) {
          await this.inventoryService.addMagicItem(userId, reward.characterId, {
            magicItemId: reward.magicItemId,
          });
          itemsApplied.push({
            characterId: reward.characterId,
            itemName: "Magic Item",
          });
        }
      } catch {}
    }

    return { xpApplied, goldApplied, itemsApplied };
  }



  @Get("encounters/mine")
  async listMyEncounters(@Req() req: AuthRequest) {
    const sessions = await this.sessionService.listByUser(getUserId(req));
    const allEncounters: any[] = [];
    for (const s of sessions) {
      const encounters = await this.encounterService.listBySession(s.id);
      allEncounters.push(...encounters);
    }
    return allEncounters;
  }



  @Post("dice/roll")
  async rollDice(@Body("expression") expression: string) {
    return this.diceService.rollExpression(expression);
  }


  @Post("dice/:rollId/resolve")
  @HttpCode(HttpStatus.OK)
  async resolveDiceRoll(
    @Param("rollId") rollId: string,
    @Body() body: { raw1: number; raw2?: number },
  ) {
    const result = this.diceRollService.resolveRoll(
      rollId,
      body.raw1,
      body.raw2,
    );
    return {
      rollId: result.rollId,
      total: result.total,
      verdict: result.verdict,
      rawD20: result.rawD20,
      rawD20Disadv: result.rawD20Disadv ?? null,
    };
  }


  @Post("dice/seed")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard, NonProductionGuard)
  async setDiceSeed(@Body() dto: DiceSeedDto) {
    this.diceService.setSeed(dto.value);
    return { seedActive: true, value: dto.value };
  }


  @Post("dice/seed/clear")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard, NonProductionGuard)
  async clearDiceSeed() {
    this.diceService.clearSeed();
    return { seedActive: false };
  }



  @Post("skill-check")
  async rollSkillCheck(@Body() dto: SkillCheckDto, @Req() req: AuthRequest) {
    const result = await this.skillCheckService.rollAbilityCheck({
      ...dto,
      userId: getUserId(req),
    });
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    if (dto.sessionId) {
      await this.eventService.emit(
        dto.sessionId,
        dto.encounterId ?? null,
        result.events,
      );
    }
    return { ok: true, value: result.value };
  }



  @Post("saving-throw")
  async rollSavingThrow(@Body() dto: SavingThrowDto, @Req() req: AuthRequest) {
    const result = await this.savingThrowService.rollSavingThrow({
      ...dto,
      userId: getUserId(req),
    });
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    if (dto.sessionId) {
      await this.eventService.emit(
        dto.sessionId,
        dto.encounterId ?? null,
        result.events,
      );
    }
    return { ok: true, value: result.value };
  }






  @Post("encounters/:id/participants/:participantId/wild-shape/enter")
  async wildShapeEnter(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { monsterSlug: string; formDisplayName?: string },
  ) {
    const userId = getUserId(req);
    try {


      const part = await this.encounterService.getParticipant(participantId);
      if (part.type !== "pc" || !part.characterId) {
        return {
          ok: false,
          error: "Wild Shape s\u00f3 pra PC Druid.",
          code: "INVALID_CASTER",
        };
      }
      if (part.bonusActionUsed) {
        return {
          ok: false,
          error: "Bonus action j\u00e1 usada neste turno.",
          code: "NO_BONUS_ACTION",
        };
      }
      const usesUsedMap = await this.stateService.getFeatureUsesUsed(
        part.characterId,
      );
      const usesUsed = usesUsedMap?.["wild-shape"] ?? 0;




      const updated = await this.transformationService.enterForm(
        participantId,
        {
          source: "wild-shape",
          monsterSlug: body.monsterSlug,
          formDisplayName: body.formDisplayName,
          durationRoundsTotal: 600,
          retainedAbilities: ["mental-stats", "speech", "class-features"],
          equipmentHandling: "merge",
          revertTriggers: {
            hpZero: true,
            durationEnd: true,
            playerDismiss: true,
            concentrationBroken: false,
          },
        },
      );


      await this.stateService.incrementFeatureUses(
        part.characterId,
        "wild-shape",
      );

      return {
        ok: true,
        value: {
          participantId: updated.id,
          displayName: updated.displayName,
          form: updated.transformationState?.form,
          usesConsumed: usesUsed + 1,
        },
      };
    } catch (err) {
      const e = err as { message?: string };
      return {
        ok: false,
        error: e.message ?? "UNKNOWN",
        code: "WILD_SHAPE_ERROR",
      };
    }
  }


  @Post("encounters/:id/participants/:participantId/wild-shape/revert")
  async wildShapeRevert(
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
  ) {
    const updated = await this.transformationService.revertForm(
      participantId,
      "player-dismiss",
    );
    return {
      ok: true,
      value: {
        participantId: updated.id,
        displayName: updated.displayName,
        transformed: !!updated.transformationState,
      },
    };
  }





  @Post("encounters/:id/familiar/share-senses")
  async shareFamiliarSenses(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Body() body: { participantId: string },
  ) {
    await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      encounterId,
    );
    const result = await this.summoningService.shareFamiliarSenses(
      encounterId,
      body.participantId,
    );
    if (result.ok && result.events.length > 0) {
      const encounter = await this.encounterRepo.findOne({
        where: { id: encounterId },
      });
      if (encounter?.sessionId) {
        await this.eventService.emit(
          encounter.sessionId,
          encounterId,
          result.events,
        );
      }
      this.emitEncounterInvalidate(encounterId, "familiar-share-senses");
    }
    return result;
  }

  @Post("encounters/:id/steed/gift")
  async useOtherworldlySteedGift(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Body()
    body: {
      participantId: string;
      targetParticipantId?: string;
      destinationX?: number;
      destinationY?: number;
    },
  ) {
    await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      encounterId,
    );
    const result = await this.combatService.resolveOtherworldlySteedGift(
      encounterId,
      {
        steedParticipantId: body.participantId,
        targetParticipantId: body.targetParticipantId,
        destinationX: body.destinationX,
        destinationY: body.destinationY,
        ownerUserId: getUserId(req),
      },
    );
    if (result.ok) {
      this.emitEncounterInvalidate(encounterId, "otherworldly-steed-gift");
    }
    return result;
  }

  @Post("encounters/:id/familiar/pocket")
  async pocketFindFamiliar(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Body() body: { participantId: string },
  ) {
    await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      encounterId,
    );
    const result = await this.summoningService.pocketFindFamiliar(
      encounterId,
      body.participantId,
    );
    if (result.ok && result.events.length > 0) {
      const encounter = await this.encounterRepo.findOne({
        where: { id: encounterId },
      });
      if (encounter?.sessionId) {
        await this.eventService.emit(
          encounter.sessionId,
          encounterId,
          result.events,
        );
      }
      this.emitEncounterInvalidate(encounterId, "familiar-pocket");
    }
    return result;
  }

  @Post("encounters/:id/familiar/reappear")
  async reappearFindFamiliar(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Body()
    body: {
      participantId: string;
      position: { x: number; y: number };
    },
  ) {
    await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      encounterId,
    );
    const result = await this.summoningService.reappearFindFamiliar(
      encounterId,
      body.participantId,
      body.position,
    );
    if (result.ok && result.events.length > 0) {
      const encounter = await this.encounterRepo.findOne({
        where: { id: encounterId },
      });
      if (encounter?.sessionId) {
        await this.eventService.emit(
          encounter.sessionId,
          encounterId,
          result.events,
        );
      }
      this.emitEncounterInvalidate(encounterId, "familiar-reappear");
    }
    return result;
  }

  @Post("encounters/:id/participants/:participantId/summon/spawn")
  async summonSpawn(
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body()
    body: {
      monsterSlug: string;
      displayName?: string;
      position?: { x: number; y: number };
      faction?: "ally" | "enemy" | "neutral";
      durationRoundsTotal?: number | null;
      concentrationLinked?: boolean;
      source?: string;
    },
  ) {
    try {
      const summon = await this.summoningService.spawnSummon(encounterId, {
        casterParticipantId: participantId,
        monsterSlug: body.monsterSlug,
        displayName: body.displayName,
        position: body.position,
        faction: body.faction ?? "ally",
        durationRoundsTotal: body.durationRoundsTotal,
        concentrationLinked: body.concentrationLinked,
        source: (body.source as "summon-beast-spell") ?? "summon-beast-spell",
      });
      return {
        ok: true,
        value: {
          summonId: summon.id,
          displayName: summon.displayName,
          linkedCasterParticipantId: summon.linkedCasterParticipantId,
          currentHp: summon.currentHp,
          maxHp: summon.maxHp,
          position: { x: summon.positionX, y: summon.positionY },
          faction: summon.faction,
        },
      };
    } catch (err) {
      const e = err as { message?: string };
      return { ok: false, error: e.message ?? "UNKNOWN", code: "SUMMON_ERROR" };
    }
  }

  @Post("encounters/:id/summons/:summonId/dismiss")
  async summonDismiss(
    @Param("id") encounterId: string,
    @Param("summonId") summonId: string,
  ) {
    await this.summoningService.dismissSummon(summonId, "player-dismiss");
    return { ok: true, value: { summonId, dismissed: true } };
  }

  @Get("encounters/:id/participants/:participantId/summons")
  async getSummonsOf(
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
  ) {
    const list = await this.summoningService.getSummonsOf(participantId);
    return {
      ok: true,
      value: list.map((s) => ({
        id: s.id,
        displayName: s.displayName,
        currentHp: s.currentHp,
        maxHp: s.maxHp,
        position: { x: s.positionX, y: s.positionY },
        faction: s.faction,
      })),
    };
  }






  @Post("fate-ladder/:characterId/open")
  async openFateLadder(
    @Param("characterId") characterId: string,
    @Body()
    body: {
      trigger: FateLadderTrigger;
      campaignId?: string;
      casterPartyHasSpell?: Array<
        "Revivify" | "Raise Dead" | "Resurrection" | "True Resurrection"
      >;
      diamondsAvailableGp?: number;
      minutesSinceDeath?: number;
    },
  ) {
    return this.fateLadderService.openLadder(characterId, body.trigger, {
      campaignId: body.campaignId,
      casterPartyHasSpell: body.casterPartyHasSpell,
      diamondsAvailableGp: body.diamondsAvailableGp,
      minutesSinceDeath: body.minutesSinceDeath,
    });
  }


  @Post("fate-ladder/:characterId/resolve")
  async resolveFateLadder(
    @Param("characterId") characterId: string,
    @Body()
    body: {
      ladderId: string;
      chosenOption: FateLadderOption;
      sacrificeDescription?: string;
      sessionId?: string;
    },
  ) {
    const result = await this.fateLadderService.resolveLadder({
      characterId,
      ladderId: body.ladderId,
      chosenOption: body.chosenOption,
      sacrificeDescription: body.sacrificeDescription,
    });

    if (!result.ok) return result;


    let applied: Awaited<
      ReturnType<typeof this.fateLadderService.applyResolution>
    > | null = null;
    try {
      applied = await this.fateLadderService.applyResolution(
        characterId,
        result.value.stateChanges,
        { sessionId: body.sessionId ?? null },
      );
    } catch (err: unknown) {


      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: true as const,
        value: {
          ...result.value,
          applyError: msg,
        },
      };
    }




    if (body.sessionId) {
      try {
        await this.eventService.emit(body.sessionId, null, [
          {
            event_type: "fate_ladder_resolved",
            data: {
              characterId,
              ladderId: body.ladderId,
              chosenOption: body.chosenOption,
              sacrificeDescription: body.sacrificeDescription,
              outcome: result.value.outcome ?? null,
              stateChangesApplied: applied.appliedChanges,
              pcFinalState: applied.pcFinalState,
            },
          },
        ]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);


        return {
          ok: true as const,
          value: {
            ...result.value,
            stateChangesApplied: applied.appliedChanges,
            pcFinalState: applied.pcFinalState,
            emitError: msg,
          },
        };
      }
    }

    return {
      ok: true as const,
      value: {
        ...result.value,
        stateChangesApplied: applied.appliedChanges,
        pcFinalState: applied.pcFinalState,
      },
    };
  }


  @Post("characters/:characterId/xp-award")
  async awardCharacterXp(
    @Req() req: AuthRequest,
    @Param("characterId") characterId: string,
    @Body()
    body: {
      amount: number;
      source: XpAwardSource;
      reason: string;
      encounterId?: string;
      questStepId?: string;
      narrativeJustification?: string;
      campaignId?: string;
    },
  ) {
    return this.xpAwardService.awardXp({
      ownerUserId: getUserId(req),
      characterId,
      amount: body.amount,
      source: body.source,
      reason: body.reason,
      encounterId: body.encounterId,
      questStepId: body.questStepId,
      narrativeJustification: body.narrativeJustification,
      campaignId: body.campaignId,
    });
  }
}
