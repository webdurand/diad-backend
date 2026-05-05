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
import { MovementService } from "./services/movement.service";
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
import { CapstonesService } from "./services/capstones.service";
import { AiTurnService } from "./services/ai-turn.service";
import { EncounterSnapshotService } from "./services/encounter-snapshot.service";
import { UpdateControlDto } from "./dto/update-control.dto";
// Spec 004
import { LegendaryActionDto } from "./dto/legendary-action.dto";
import { GrappleEscapeDto } from "./dto/grapple-escape.dto";
import { LairActionDto } from "./dto/lair-action.dto";
import { LegendaryActionService } from "./services/legendary-action.service";
import { GrappleEscapeService } from "./services/grapple-escape.service";
import { LairActionService } from "./services/lair-action.service";
import { ConditionLifecycleService } from "./services/condition-lifecycle.service";
// Spec 002 — join-request loop
import { JoinRequestService } from "./services/join-request.service";
// Spec 016 — Play Shell Foundation
import { FateLadderService } from "./services/fate-ladder.service";
import type {
  FateLadderTrigger,
  FateLadderOption,
} from "./services/fate-ladder.service";
import { XpAwardService } from "./services/xp-award.service";
import { DiceRollService } from "./services/dice-roll.service";
import type { XpAwardSource } from "src/entities/xp-award-event.entity";
// Spec 020 — Tool Surface Completion
import { RevivifyCheckService } from "./services/revivify-check.service";
import { DyingStateService } from "./services/dying-state.service";
import type { DyingState, DyingReason } from "./services/dying-state.service";
import { LootRollService } from "./services/loot-roll.service";
import type { CRBand, LootMode } from "./services/loot-roll.service";
import { StartEncounterFromNarrativeService } from "./services/start-encounter-from-narrative.service";
import { MoveToLocationService } from "./services/move-to-location.service";
// Spec 027 (M2 follow-up) — WS realtime substitui polling no frontend.
import { RealtimeService } from "src/realtime/realtime.service";
import { StartEncounterFromNarrativeDto } from "./dto/start-encounter-from-narrative.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { failure, GameErrorCode } from "./interfaces/result.type";
// Spec 006 — response DTOs
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
    private readonly capstonesService: CapstonesService,
    private readonly aiTurnService: AiTurnService,
    private readonly snapshotService: EncounterSnapshotService,
    // Spec 013 — Tile-effect resolver disparado em PATCH position pra harness/probe.
    private readonly persistentArea: PersistentAreaService,
    // Spec 004
    private readonly legendaryActionService: LegendaryActionService,
    private readonly grappleEscapeService: GrappleEscapeService,
    private readonly lairActionService: LairActionService,
    private readonly conditionLifecycle: ConditionLifecycleService,
    // Spec 002
    private readonly joinRequestService: JoinRequestService,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    // Spec 016 — Play Shell Foundation
    private readonly fateLadderService: FateLadderService,
    private readonly xpAwardService: XpAwardService,
    // Spec 016 M2 — Dice request lifecycle (active checks via SSE)
    private readonly diceRollService: DiceRollService,
    // Spec 020 — Tool Surface Completion
    private readonly revivifyCheckService: RevivifyCheckService,
    private readonly dyingStateService: DyingStateService,
    private readonly lootRollService: LootRollService,
    private readonly startEncounterFromNarrativeService: StartEncounterFromNarrativeService,
    private readonly moveToLocationService: MoveToLocationService,
    // Spec 027 (M2 follow-up) — WS realtime para invalidar cache do frontend
    // após mutações de turno/encontro. Sala: encounter:<id>.
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Spec 027 (M2 follow-up) — emite invalidate WS pra que clientes refreshem.
   * Não tenta diff incremental: mantém simples (refresh full do encounter no
   * frontend). Frequência baixa (uma por mutação significativa). Erros
   * silenciados — emit nunca quebra o response do endpoint.
   */
  private emitEncounterInvalidate(encounterId: string, reason: string): void {
    try {
      this.realtime.emitToRoom(
        `encounter:${encounterId}`,
        "encounter:invalidate",
        { encounterId, reason, at: new Date().toISOString() },
      );
    } catch {
      /* noop */
    }
  }

  // ==================== SPEC 020 — TOOL SURFACE COMPLETION ====================

  /**
   * Spec 020 — Revivify check (RAW pure, stateless).
   * Body: { characterId, timeSinceDeathMin, hasDiamond300gp, casterCharacterId?, campaignId? }
   */
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

  /**
   * Spec 020 — set_dying_state.
   * PATCH /game/encounters/:id/participants/:pid/dying-state
   */
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

  /**
   * Spec 020 — roll_loot_table.
   * POST /game/loot/roll
   */
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

  /**
   * Spec 020 — start_encounter_from_narrative.
   * POST /game/sessions/:sessionId/encounters/from-narrative
   *
   * Orquestra narrativa→combate: cria encounter, materializa NPCs hostis,
   * posiciona tokens, inicia combate, opcionalmente aplica Surprised round.
   * Emite EncounterEvent.encounter_started.
   */
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

  /**
   * Move PC pra location adjacente. Valida connection (existência, isLocked,
   * requirements). Cria scene nova com locationId destino — emite scene_changed
   * via SceneService.create. Idempotente quando target == current.
   */
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

  /**
   * Lista connections (saídas) da scene ativa, filtrando hidden.
   * Frontend renderiza chips TIER 3 (1 chip por travel disponível).
   */
  @Get("sessions/:sessionId/available-travels")
  async availableTravels(@Param("sessionId") sessionId: string) {
    const travels =
      await this.moveToLocationService.listAvailableTravels(sessionId);
    return { ok: true as const, value: travels };
  }

  // ==================== SESSIONS ====================

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

  // ==================== ENCOUNTERS ====================

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

  // Spec 027 (M2 follow-up) — sem cache HTTP. Encounter muda a cada turno
  // (action_used, hp, conditions) e ETag estável pode mascarar mudanças.
  @Get("encounters/:id")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  async getEncounter(@Param("id") id: string) {
    const encounter = await this.encounterService.getById(id);
    return {
      ok: true as const,
      value: toEnrichedEncounterResponse(encounter),
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

  // Spec 002 — Join-request loop ------------------------------------------

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

  /**
   * Spec 016 P3 (M2) — Talk-down: tentativa narrativa pré-iniciativa.
   * Player resolve um skill check (Persuasion/Deception/Intimidation/Insight)
   * vs DC alto (default 18 T1). Sucesso → encounter ends sem combate (no XP);
   * falha → caller proceeds para roll initiative com disadvantage NPCs.
   *
   * Body: { skill, dc, totalModifier, rawD20, advantage? }
   * RawD20 vem do frontend (player rolagem visual). Server resolve verdict.
   *
   * NOTA M2: outcome 'talked_down' não persiste em status enum (evita migration).
   * M3 adiciona CombatResolutionCard storage com outcome_kind explícito.
   */
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

    // Spec 016 §7.1 / Task BG3 parity — sucesso narrativo concede XP igual
    // ao kill (anti-grind). Compute amount = soma de XP de todos os monsters
    // hostis do encounter. Award per-PC. Source 'combat_resolved_peacefully'.
    const xpAwards: Array<{
      characterId: string;
      awardedXp: number;
      eventId: string;
    }> = [];

    if (succeeded) {
      const encounter = await this.encounterService.getById(id);

      const totalXp = (encounter.participants ?? [])
        .filter(
          (p) => p.type === "monster" && p.faction === "enemy" && p.monster,
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
          // endEncounter pode falhar com 0 monsters; ok pra talk-down narrativo
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

  /**
   * Spec 016 M2 — Pre-combat briefing: dados pra UI renderizar
   * `<PreCombatBriefingCard>` antes do roll initiative. Inclui talkDown
   * eligibility (humanoid OR INT >= 8, sem condições enraged/summoned).
   *
   * talkDownDc = 10 + party_level (clamp 5-20).
   */
  @Get("encounters/:id/pre-combat-briefing")
  async preCombatBriefing(@Param("id") encounterId: string) {
    const encounter = await this.encounterService.getById(encounterId);

    const monsterParticipants = (encounter.participants ?? []).filter(
      (p) => p.type === "monster" && p.faction === "enemy" && p.monster,
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

    // Tier (DMG 2024): tier1 = lvl 1-4, tier2 = 5-10, tier3 = 11-16, tier4 = 17-20.
    const pcParticipants = (encounter.participants ?? []).filter(
      (p) => p.type === "pc" && p.characterId,
    );
    let partyLevel = 1;
    if (pcParticipants.length > 0) {
      // Tenta usar enrichment (currentHp/maxHp setado em getById). Fallback a 1.
      // Lookup de level real via CharacterClass somatório fica caro aqui;
      // approximação por participants.length não-zero. Spec 016 M2 default = 1.
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

    // Talk-down eligibility: monsters humanoid OR INT >= 8, sem 'enraged'
    // ou 'summoned' status. linkedCasterParticipantId != null = summoned.
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

  /**
   * Spec 027 (M2 follow-up) — fim de combate é decisão IA-only. Em DIAD solo
   * o player nunca dispara este endpoint diretamente: ou todos NPCs hostis
   * são derrotados (auto-end no backend), ou todos PCs caem (auto-end). Este
   * handler ainda existe pra DM-led campaigns futuras (multiplayer V2).
   *
   * Gate: só roda se o caller é dono de algum PC do encounter (placeholder
   * mínimo até multiplayer DM real). Em solo, player é dono do PC, então
   * conserta exatamente o gap: player NÃO podia chamar isso por NPC.
   *
   * MonsterTurnAutoService chama este endpoint internamente como
   * `service-side` skipando o guard (passa `internal: true`).
   */
  @Post("encounters/:id/resolve")
  async resolveEncounter(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: ResolveEncounterDto,
  ) {
    const userId = getUserId(req);
    // Resolve via current turn participant — se for PC do user, autoriza;
    // senão recusa. Em solo single-PC isso = "só o player pode resolver
    // manual via UI"; quando IA encerra, ela usa a invocação interna do
    // service (sem passar por este controller).
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

  // ==================== COMBAT ====================

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
    // Spec 027 (M2 follow-up) — gate por dono do caster. Sem isso o player
    // podia disparar AoE como se fosse NPC, controlando combate inteiro.
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
      /** Spec 003: breaking change — aceita apenas `actionSlug`. `actionName` antigo rejeitado. */
      actionSlug?: string;
      /** @deprecated Shape pre-spec-003. Rejected with 400 MISSING_ACTION_SLUG. */
      actionName?: string;
      /** Opções específicas da ação (ex: Unarmed Strike { mode: 'damage'|'grapple'|'shove' }). */
      options?: Record<string, unknown>;
      forceAdvantage?: boolean;
      forceDisadvantage?: boolean;
    },
  ) {
    // Spec 003 breaking: só aceita actionSlug.
    if (!body.actionSlug) {
      return {
        ok: false,
        error:
          "Campo 'actionSlug' e obrigatorio. O shape antigo ('actionName') foi removido em Spec 003.",
        code: "MISSING_ACTION_SLUG",
        hint: "Use actionSlug de GET /characters/:id/combat-actions ou GET /encounters/:id/participants/:pid/actions.",
      };
    }
    // Shove/Grapple standalone foram removidos — viram sub-opções do Unarmed Strike.
    if (body.actionSlug === "shove" || body.actionSlug === "grapple") {
      return {
        ok: false,
        error: "Shove e Grapple sao sub-opcoes de Unarmed Strike (XPHB 2024).",
        code: "USE_UNARMED_STRIKE",
        hint: `Use actionSlug='unarmed-strike' com options.mode='${body.actionSlug}'.`,
      };
    }

    // Spec 027 (M2 follow-up) — gate de dono do attacker. PermissionResolver
    // recusa quando o player tenta atacar usando NPC/monster (NPCs só DM
    // controla; em DIAD solo, IA é DM, player não passa o gate).
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.attackerParticipantId,
      getUserId(req),
      id,
    );
    // Traduz slug → actionName interno para manter o fluxo de resolveAttack intacto.
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

  /**
   * Spec 027 (M2, AC2.6) — endpoint canônico para Hostile Action Arbiter
   * + tool agno `apply_damage`. Path `apply-damage` é o nome contractual da
   * spec; `damage` mantido como alias backward-compat (usado por code legacy
   * do combat surface).
   *
   * Princípio XI: erros propagam via DiadException (CombatService já throws
   * com codes estruturados). Body é o input runtime do tool — `targetParticipantId`
   * resolve permissão antes do combat path mutar HP.
   */
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
    @Body() body: { participantId: string; condition: string; apply: boolean },
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      id,
    );
    return this.combatService.applyCondition(id, { ...body, ownerUserId });
  }

  // Spec 027 (M2 follow-up) — desabilita cache HTTP/ETag.
  // Express auto-gera ETag (W/...) que pode bater igual entre turns mesmo
  // depois de initializeTurn ter resetado actionUsed/movementRemaining,
  // causando 304 com body stale no client. `no-store` força sempre 200.
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

  /**
   * Spec 003 — ActionDescriptor[] tipado do participant no encounter,
   * com action economy corrente (turno ativo, actionUsed, attacksUsedThisTurn,
   * reactionUsed) e rest state (feature_uses_used, spell_slots_used) aplicados.
   */
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
  async endTurn(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    // Spec 027 (M2 follow-up) — gate de dono do current turn participant.
    // Antes qualquer user autenticado podia bater em /end-turn e avançar o
    // turno do NPC pra fazer o NPC ficar idle (efetivamente "skip" do
    // ataque). Resolver garante: só dono do PC ativo pode end-turn; turno
    // de NPC é encerrado pelo MonsterTurnAutoService no backend, sem player.
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
    // Localiza o participante que tem essa instância
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

  // ==================== CONTROL TOGGLE (SPEC 003 US4) ====================

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

  // ==================== AI TURN + SNAPSHOT (SPEC 003 US3) ====================

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

  // ==================== GENERIC ACTIONS (SPEC 003 US2) ====================

  @Post("encounters/:id/generic-action")
  async executeGenericAction(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: GenericActionDto,
  ) {
    const authUserId = getUserId(req);
    // Valida permissão: dono do PC ou DM da sessão
    await this.permissionResolver.resolveMutationOwner(
      dto.participantId,
      authUserId,
      id,
    );
    return this.genericActionsService.execute(id, dto);
  }

  /**
   * Spec 003 Fatia 7/8 — endpoint unificado para invocar class features
   * ativaveis (Second Wind, Action Surge, Reckless Attack, Lay on Hands,
   * Cunning Action wrapper, Turn Undead/Channel Divinity, Rage, Wild Shape,
   * Bardic Inspiration, Cunning Strike, Uncanny Dodge, Flurry of Blows,
   * Metamagic, Pact of the Blade, Divine Sense, Steady Aim).
   *
   * Features FULL resolvem mecanica aqui (heal, flags, pool). Features
   * STUB emitem evento `class_feature_invoked` que a Spec 4 consome.
   */
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

  // ==================== SPELLCASTING ====================

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
      /** Spec 003 Fatia 9 — cast como reaction (Shield, Counterspell, etc.). */
      asReaction?: boolean;
      /** Evento que disparou a reaction (ex: attack_rolled). Obrigatorio se asReaction=true. */
      triggerEventId?: string;
      /** Spec 012 Gap 1 — centro da AoE em coordenadas de grid (cells). */
      aoeOriginCell?: { x: number; y: number };
      /** Spec 012 Sorcerer — Metamagic RAW 2024 (6 types). */
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
      /** Spec 012 Lote B — Polymorph: beast form slug (default 'brown-bear'). */
      polymorphBeastSlug?: string;
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
      asReaction: body.asReaction,
      triggerEventId: body.triggerEventId,
      aoeOriginCell: body.aoeOriginCell,
      metamagic: body.metamagic,
      polymorphBeastSlug: body.polymorphBeastSlug,
    });
    // Spec 013 — persist events to timeline (controller-level emit). Pre-013
    // a Spirit Guardians legacy não persistia eventos; agora ground-effect
    // events precisam estar queryable via /events?type=tile_effect_*.
    if (result.ok && result.events && result.events.length > 0) {
      try {
        const enc = await this.encounterRepo.findOne({ where: { id } });
        if (enc?.sessionId) {
          await this.eventService.emit(enc.sessionId, id, result.events);
        }
      } catch {
        // best-effort — falha de persistência não aborta o cast
      }
    }
    return result;
  }

  /**
   * Spec 015 Eixo 4 — Reverte transformação ativa (Wild Shape, Polymorph, etc).
   * Idempotente: se participant não está transformado, retorna reverted=false.
   * Permissão: owner do participant OU DM do encounter (resolveMutationOwner).
   */
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
    // Spec 015 Eixo 4 RAW: reverter Wild Shape voluntariamente custa bonus
    // action (XPHB 2024 p.303). Outras sources (Polymorph via caster dismiss)
    // seguem regra da própria spell — não bloqueia aqui. Auto-revert (hp-zero,
    // duration-expired, concentration-broken) é grátis.
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

  /**
   * Spec 012 Lote D — Rogue L20 Stroke of Luck: arm 1/SR auto-hit OU d20=20.
   */
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

  /**
   * Spec 012 Lote D — Paladin L20 Devotion Holy Nimbus: cast aura 30ft 1min.
   */
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

  /**
   * Spec 012 Lote C — Warlock L20 Eldritch Master.
   * 1/LR meditação 1min regain all pact slots.
   */
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

  /**
   * Spec 012 Lote B — Opportunity Attack (RAW 2024 XPHB).
   *
   * Disparado como reaction quando um participante sai da reach de um inimigo.
   * Movement.service emite `opportunity_attack_available`; este endpoint
   * executa a reação (1 weapon attack) e consome reactionsUsed.
   */
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

  /**
   * Spec 012 Lote B — Hunter's Mark / Hex transfer.
   *
   * RAW 2024 XPHB: quando o alvo marcado cai a 0 HP antes da spell expirar,
   * o caster pode mover a mark para um novo alvo usando bonus action no
   * turno subsequente, SEM gastar novo spell slot. A concentração continua
   * ativa (só muda o alvo).
   */
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

  // ==================== MOVEMENT ====================

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
    // Spec 013 — persist tile-effect events emitted durante movimento
    // (resolveEntry, resolveMoveThrough). Sem persist, /events?type=tile_*
    // retorna vazio.
    if (result.ok && result.events && result.events.length > 0) {
      try {
        const enc = await this.encounterRepo.findOne({ where: { id } });
        if (enc?.sessionId) {
          await this.eventService.emit(enc.sessionId, id, result.events);
        }
      } catch {
        // best-effort
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

  /**
   * Spec 012 Lote B — Setar difficult terrain cells no grid do encontro.
   * Substitui o array inteiro; cada cell em `cells` custa 10ft ao mover
   * (bypassed por Land's Stride).
   */
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

  // ==================== MAP ====================

  @Post("encounters/:id/map/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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
    // Spec 013 — PATCH position é teleport DM-side, mas pra harness/probe
    // funcionar ground effects precisam disparar mesmo via teleport.
    // Captura fromX/fromY antes do save, depois resolve tile-effects no path
    // Manhattan e persiste events. Aura relocation segue o caster.
    const participant =
      await this.encounterService.getParticipant(participantId);
    const fromX = participant.positionX ?? body.x;
    const fromY = participant.positionY ?? body.y;
    const updated = await this.encounterService.updateParticipantPosition(
      participantId,
      body.x,
      body.y,
    );
    // Compute traversed cells (Manhattan: X primeiro, depois Y)
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
        for (const cell of traversed) {
          const r = await this.persistentArea.resolveEntry(
            updated,
            cell,
            updated.encounterId,
          );
          events.push(...r.events);
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
        // best-effort
      }
    }
    if (events.length > 0) {
      try {
        const enc = await this.encounterRepo.findOne({
          where: { id: encounterId },
        });
        if (enc?.sessionId) {
          await this.eventService.emit(enc.sessionId, encounterId, events);
        }
      } catch {
        // best-effort
      }
    }
    return updated;
  }

  /**
   * Spec 012 — Heroic Inspiration.
   *  - `POST /arm-inspiration { arm: bool }`: player "arma" pra próximo d20 test.
   *  - `POST /grant-inspiration { grant: bool }`: DM concede/remove inspiração.
   *
   * Autorização: owner-check happens dentro do service. DM flow usa same
   * endpoint diferenciado pelo guard (futuro TODO — por enquanto qualquer
   * authenticated user pode chamar grant, mas combat session é privado).
   */
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

  /**
   * Fighting Style Interception (RAW 2024) — reação reduz dano de aliado
   * adjacente em 1d10+PB. Consome reaction.
   */
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

  /**
   * Fighting Style Protection (RAW 2024) — reação impõe disadvantage no
   * próximo attack contra aliado adjacente. Requer shield. Consome reaction.
   */
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

  /**
   * Fighter L2 Tactical Mind (RAW 2024) — endpoint dedicado pra reroll de
   * failed ability check. Input: total original + DC. Rola 1d10 + soma.
   * Consome Second Wind use só se passou.
   */
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

  /**
   * Battle Master Trip Attack (RAW 2024) — hit → spend superiority die,
   * target STR save, falha = Prone.
   */
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

  /**
   * Battle Master Precision Attack (RAW 2024) — adiciona superiority die ao
   * attack roll total. Chamado após attack falhar; backend retorna newTotal.
   */
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

  /**
   * Cleric L5 Sear Undead (RAW 2024) — CD + Magic action. Undead 30ft CON
   * save DC 8+WIS+PB. Falha = 10+5×(L-5) radiant; sucesso half.
   */
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

  /**
   * Paladin L1 Divine Smite (RAW 2024) — spell Bonus Action pós hit melee/unarmed.
   * Base 2d8 + (slotLevel-1)×1d8 radiant (cap 5d8 em slot 4+). +1d8 se Fiend/Undead.
   * Crit dobra. freeCast=true usa Paladin's Smite L2 (sem slot).
   */
  @Post("encounters/:id/participants/:participantId/paladin/divine-smite")
  async paladinDivineSmite(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body()
    body: {
      targetParticipantId: string;
      slotLevel: number;
      hitWasCritical: boolean;
      targetType: "fiend" | "undead" | null;
      freeCast: boolean;
    },
  ) {
    const userId = getUserId(req);
    const result = await this.paladinFeatures.divineSmite(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
      body.slotLevel,
      body.hitWasCritical,
      body.targetType,
      body.freeCast,
    );
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Paladin L11 Radiant Strikes (RAW 2024) — +1d8 radiant passive em melee/unarmed hit.
   */
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

  /**
   * Sorcerer L2+ Font of Magic — pool de Sorcery Points.
   * GET retorna {total, used, remaining}.
   */
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

  /**
   * Sorcerer L2+ Font of Magic — converte 1 spell slot em N SP (N = slotLevel).
   */
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

  /**
   * Sorcerer L2+ Font of Magic — converte SP em 1 spell slot (RAW: L1=2/L2=3/L3=5/L4=6/L5=7).
   */
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

  /**
   * Sorcerer L5+ Sorcerous Restoration — 1/LR uso em SR recupera
   * floor(classLevel/2) SP.
   */
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

  /**
   * Paladin Devotion L3 Sacred Weapon (RAW 2024 CD) — arma +CHA attack + radiant
   * damage + luz 20ft por 1 min (10 rounds).
   */
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

  /**
   * Cleric Life Domain L3 Preserve Life (RAW 2024 CD) — distribui pool 5×level
   * HP entre aliados 30ft, cap individual = pool/2.
   */
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

  /**
   * Cleric L7 Blessed Strikes (RAW 2024) — 1/turn melee hit OR cantrip save-fail
   * → +1d8 radiant (+2d8 em L14 Improved).
   */
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

  /**
   * Cleric L10 Divine Intervention (RAW 2024) — Magic action, auto-sucesso.
   * Cap slot L5 em L10-L19, L9 em L20 (Greater).
   */
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

  /**
   * Berserker L3 Frenzy (RAW 2024) — primeiro hit do turno em rage+reckless
   * ganha +Nd6 damage. Chamado após hit confirmado.
   */
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

  /**
   * Berserker L10 Retaliation (RAW 2024) — reaction melee attack contra
   * atacante adjacente que causou dano.
   */
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

  /**
   * Berserker L14 Intimidating Presence (RAW 2024) — Bonus action, 30ft
   * emanation, cada target WIS save DC 8+STR+PB. Falha = Frightened 1min.
   */
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

  /**
   * Barbarian L11 Relentless Rage (RAW 2024) — PC em rage caiu a 0 HP.
   * CON save DC 10+5×uses. Passa: volta 1 HP + consome use.
   */
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

  /**
   * Barbarian L18 Indomitable Might (RAW 2024) — STR check < score, usa score.
   */
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

  /**
   * Barbarian L9 Brutal Strike (RAW 2024) — Forceful Blow: +Nd10 damage +
   * target push 10ft + attacker move ½ speed. Exige Rage ativo.
   */
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

  /**
   * Barbarian L9 Brutal Strike (RAW 2024) — Hamstring Blow: +Nd10 damage +
   * target speed -15ft até fim do próximo turno. Exige Rage ativo.
   */
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

  /**
   * Fighter L9 Tactical Master (RAW 2024) — arma mastery alternativa
   * (push/sap/slow) pro próximo attack. Combat.service consome o override.
   */
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

  /**
   * Premissa weapons-in-hand — Sacar/Guardar arma em combate.
   * Consome 1× free object interaction por turno (RAW 2024). Delega pro
   * inventory.service pra aplicar o swap + valida limite no participant.
   */
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

  // ==================== EVENTS ====================

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
    // Validar tipos de evento se fornecidos.
    // Spec 013 — aceita tanto camelCase ('tileEffectCreated') quanto
    // snake_case ('tile_effect_created') pra compat com probes/harness.
    // Normaliza pra camelCase antes de validar contra whitelist.
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
      // Converter camelCase → snake_case para filtrar no DB
      eventTypes = normalizedTypes.map(camelToSnakeCase);
    }

    const { events, total } =
      await this.eventService.getEncounterTimelineFiltered(id, {
        since: query.since,
        eventTypes,
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
      });

    // Buscar participants para popular actorName/targetName
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

  // ==================== QUEST REWARDS ====================

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

    // Update quest status
    await this.questService.update(questId, { status: body.status });

    // Apply XP
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

    // Apply Gold
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

    // Apply Items
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

  // ==================== ENCOUNTERS BY USER ====================

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

  // ==================== DICE ====================

  @Post("dice/roll")
  async rollDice(@Body("expression") expression: string) {
    return this.diceService.rollExpression(expression);
  }

  /**
   * Spec 016 M2 — Resolve um active dice check.
   * Body: { raw1: 1-20, raw2?: 1-20 }. raw2 ignorado se advantage='normal'.
   */
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

  /**
   * Ativa seed determinístico no DiceService (spec 012).
   * Admin-only, bloqueado em produção (exceto com ALLOW_TEST_ENDPOINTS=true).
   */
  @Post("dice/seed")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard, NonProductionGuard)
  async setDiceSeed(@Body() dto: DiceSeedDto) {
    this.diceService.setSeed(dto.value);
    return { seedActive: true, value: dto.value };
  }

  /**
   * Desativa seed, volta a Math.random (spec 012).
   */
  @Post("dice/seed/clear")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard, NonProductionGuard)
  async clearDiceSeed() {
    this.diceService.clearSeed();
    return { seedActive: false };
  }

  // ==================== SKILL CHECKS ====================

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

  // ==================== SAVING THROWS ====================

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

  // ─────────────────────────────────────────────────────────────────────
  // Spec 012 — Transformation pipeline (Wild Shape + Polymorph + …)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Druid Wild Shape (L2+) — entra em forma de besta.
   * RAW 2024 XPHB: CR max = 1/4 L2 (no fly/swim), 1/2 L4 (no fly), 1 L8+ (any).
   * Duração: 1h por uso (não concentração). HP separado. Reverte em HP 0.
   */
  @Post("encounters/:id/participants/:participantId/wild-shape/enter")
  async wildShapeEnter(
    @Req() req: AuthRequest,
    @Param("id") encounterId: string,
    @Param("participantId") participantId: string,
    @Body() body: { monsterSlug: string; formDisplayName?: string },
  ) {
    const userId = getUserId(req);
    try {
      // RAW 2024 XPHB: Wild Shape \u00e9 bonus action, uses = PB/SR.
      // Valida uses + bonus action antes de enterForm.
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
      // PB-based uses: L2-4=2, L5-8=3, L9-12=4, L13-16=5, L17+=6
      // (simplified; frontend can query state.feature_uses_used if needed)
      // Use a reasonable cap of 6 as hard ceiling since we don't easily have the druid level here.

      const updated = await this.transformationService.enterForm(
        participantId,
        {
          source: "wild-shape",
          monsterSlug: body.monsterSlug,
          formDisplayName: body.formDisplayName,
          durationRoundsTotal: 600, // 1h RAW = 600 rounds (6 seg cada)
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

      // Bonus action consumida pelo service. Incrementa uses na ficha.
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

  /**
   * Reverte transformação (Wild Shape, Polymorph, etc). Player dismiss manual.
   */
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

  // ─────────────────────────────────────────────────────────────────────
  // Spec 012 — Summoning pipeline (Summon Beast, Conjure Animals, Familiar, ...)
  // ─────────────────────────────────────────────────────────────────────

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

  // ──────────────────────────────────────────────────────────────────────
  // Spec 016 — Play Shell Foundation
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Fate Ladder — abre modal narrativo ao 3º death save fail ou massive damage.
   * Triggers válidos: three_failed_death_saves | massive_damage_2024 | instant_kill_effect.
   */
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

  /**
   * Resolve opção do Fate Ladder. Retorna stateChanges descritivos pro
   * Coordinator narrar via DM agent. Body: { ladderId, chosenOption,
   * sacrificeDescription? }.
   *
   * Spec 027 (M2 follow-up): além de retornar stateChanges, também
   *  (a) aplica os descritores que mapeiam pro DB (`pc_hp=1`,
   *      `pc_status=*`) via `fateLadderService.applyResolution`, e
   *  (b) emite evento `fate_ladder_resolved` em `game_events` com payload
   *      estruturado pro AiProxy injetar em sceneContext na próxima
   *      narrativa (`systemHint='post_fate_choice'`).
   *
   * Sem (a), narrativa do turno seguinte mente sobre o estado do PC.
   * Sem (b), Coordinator não sabe qual opção foi escolhida.
   */
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

    // (a) Aplica stateChanges no character_state.
    let applied:
      | Awaited<ReturnType<typeof this.fateLadderService.applyResolution>>
      | null = null;
    try {
      applied = await this.fateLadderService.applyResolution(
        characterId,
        result.value.stateChanges,
      );
    } catch (err: unknown) {
      // Log + continue: a narrativa ainda pode rodar (com warning), mas
      // sinalizamos no response pra debug.
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: true as const,
        value: {
          ...result.value,
          applyError: msg,
        },
      };
    }

    // (b) Emit `fate_ladder_resolved` em `game_events` pra AiProxy injetar
    // em sceneContext quando systemHint='post_fate_choice'. SessionId é
    // opcional — se ausente, evento não é emitido (warning loga).
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
        // Falha ao emitir não bloqueia response — Coordinator caí no
        // fallback genérico (post_fate_choice sem evento).
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

  /**
   * Granular XP award. Source enum granular (combat_kill | quest_step | ...);
   * respeita campaign.xp_mode (rules|milestone|hybrid). Audit log em
   * `xp_award_events` consumido por Director memory L4.
   */
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
