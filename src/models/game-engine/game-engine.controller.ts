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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CloudinaryService } from 'src/shared/cloudinary.service';
import { QuestService } from '../world/services/quest.service';
import { CharacterStateService } from '../characters/services/character-state.service';
import { InventoryService } from '../characters/services/inventory.service';
import { EquipmentSourceEnum } from 'src/entities/enums';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { NonProductionGuard } from '../auth/non-production.guard';
import { DiceSeedDto } from './dto/dice-seed.dto';
import { SessionService } from './services/session.service';
import type { CreateSessionDto, UpdateSessionDto } from './services/session.service';
import { EncounterService } from './services/encounter.service';
import type { CreateEncounterDto, AddMonsterDto, BatchPositionDto } from './services/encounter.service';
import { CombatService } from './services/combat.service';
import type { AttackDto, DamageDto, HealDto, ConditionDto } from './services/combat.service';
import { EventService } from './services/event.service';
import { MovementService } from './services/movement.service';
import { SpellCastingService } from './services/spell-casting.service';
import { DiceService } from './services/dice.service';
import { SkillCheckService } from './services/skill-check.service';
import type { SkillCheckDto } from './services/skill-check.service';
import { SavingThrowService } from './services/saving-throw.service';
import type { SavingThrowDto } from './services/saving-throw.service';
import { PermissionResolver } from './services/permission-resolver.service';
import { DeathSaveDto } from './dto/death-save.dto';
import { GenericActionDto } from './dto/generic-action.dto';
import { GenericActionsService } from './services/generic-actions.service';
import { ClassFeatureExecutorService } from './services/class-feature-executor.service';
import { FightingStyleReactionsService } from './services/fighting-style-reactions.service';
import { TacticalFeaturesService } from './services/tactical-features.service';
import { BattleMasterService } from './services/battle-master.service';
import { BrutalStrikeService } from './services/brutal-strike.service';
import { BarbarianFeaturesService } from './services/barbarian-features.service';
import { BerserkerService } from './services/berserker.service';
import { ClericFeaturesService } from './services/cleric-features.service';
import { PaladinFeaturesService } from './services/paladin-features.service';
import { SorcererFeaturesService } from './services/sorcerer-features.service';
import { TransformationService } from './services/transformation.service';
import { AiTurnService } from './services/ai-turn.service';
import { EncounterSnapshotService } from './services/encounter-snapshot.service';
import { UpdateControlDto } from './dto/update-control.dto';
// Spec 004
import { LegendaryActionDto } from './dto/legendary-action.dto';
import { GrappleEscapeDto } from './dto/grapple-escape.dto';
import { LairActionDto } from './dto/lair-action.dto';
import { LegendaryActionService } from './services/legendary-action.service';
import { GrappleEscapeService } from './services/grapple-escape.service';
import { LairActionService } from './services/lair-action.service';
import { ConditionLifecycleService } from './services/condition-lifecycle.service';
// Spec 002 — join-request loop
import { JoinRequestService } from './services/join-request.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { failure, GameErrorCode } from './interfaces/result.type';
// Spec 006 — response DTOs
import { toEnrichedEncounterResponse } from './dto/encounter-response.dto';
import { toEventResponseDto, buildParticipantsMap, camelToSnakeCase } from './dto/event-response.dto';
import { GetEventsQueryDto, VALID_EVENT_TYPES } from './dto/get-events-query.dto';
import { ResolveEncounterDto } from './dto/resolve-encounter.dto';

interface AuthRequest extends Request {
  user?: { id: string; email: string; name?: string; username?: string };
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException('Usuario nao autenticado.');
  return id;
}

@Controller('game')
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
    private readonly aiTurnService: AiTurnService,
    private readonly snapshotService: EncounterSnapshotService,
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
  ) {}

  // ==================== SESSIONS ====================

  @Post('sessions')
  async createSession(
    @Req() req: AuthRequest,
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionService.create(getUserId(req), dto);
  }

  @Get('sessions/solo')
  async listSoloSessions(@Req() req: AuthRequest) {
    const sessions = await this.sessionService.listByUser(getUserId(req));
    return sessions
      .filter((s) => s.name?.startsWith('Solo:'))
      .map((s) => ({
        id: s.id,
        name: s.name.replace('Solo: ', ''),
        status: s.status,
        updatedAt: s.updatedAt,
        createdAt: s.createdAt,
      }));
  }

  @Get('sessions')
  async listSessions(@Req() req: AuthRequest) {
    return this.sessionService.listByUser(getUserId(req));
  }

  @Get('sessions/:id')
  async getSession(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    await this.sessionService.ensureAccess(id, getUserId(req));
    return this.sessionService.getById(id);
  }

  @Patch('sessions/:id')
  async updateSession(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    await this.sessionService.ensureOwnership(id, getUserId(req));
    return this.sessionService.update(id, dto);
  }

  @Delete('sessions/:id')
  async deleteSession(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.sessionService.ensureOwnership(id, getUserId(req));
    return this.sessionService.delete(id);
  }

  @Post('sessions/:id/characters')
  async addCharacterToSession(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body('characterId') characterId: string,
  ) {
    await this.sessionService.ensureOwnership(id, getUserId(req));
    return this.sessionService.addCharacter(id, characterId);
  }

  @Delete('sessions/:id/characters/:charId')
  async removeCharacterFromSession(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('charId') charId: string,
  ) {
    await this.sessionService.ensureOwnership(id, getUserId(req));
    return this.sessionService.removeCharacter(id, charId);
  }

  // ==================== ENCOUNTERS ====================

  @Post('sessions/:sessionId/encounters')
  async createEncounter(
    @Req() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateEncounterDto,
  ) {
    const userId = getUserId(req);
    await this.sessionService.ensureOwnership(sessionId, userId);
    return this.encounterService.create(sessionId, dto, userId);
  }

  @Get('sessions/:sessionId/encounters')
  async listEncounters(
    @Req() req: AuthRequest,
    @Param('sessionId') sessionId: string,
  ) {
    await this.sessionService.ensureOwnership(sessionId, getUserId(req));
    return this.encounterService.listBySession(sessionId);
  }

  @Get('encounters/:id')
  async getEncounter(@Param('id') id: string) {
    const encounter = await this.encounterService.getById(id);
    return {
      ok: true as const,
      value: toEnrichedEncounterResponse(encounter),
      events: [],
    };
  }

  @Get('campaigns/:campaignId/encounters')
  async listEncountersByCampaign(@Param('campaignId') campaignId: string) {
    return this.encounterService.listByCampaign(campaignId);
  }

  @Delete('encounters/:id')
  async deleteEncounter(@Param('id') id: string) {
    await this.encounterService.deleteEncounter(id);
    return { ok: true };
  }

  @Post('encounters/:id/monsters')
  async addMonster(
    @Param('id') id: string,
    @Body() dto: AddMonsterDto,
  ) {
    return this.encounterService.addMonster(id, dto);
  }

  @Post('encounters/:id/characters')
  async addCharacterToEncounter(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body('characterId') characterId: string,
  ) {
    return this.encounterService.addCharacter(
      id,
      characterId,
      getUserId(req),
    );
  }

  @Post('encounters/:id/late-join/character')
  async lateJoinCharacter(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body('characterId') characterId: string,
  ) {
    return this.encounterService.lateJoinCharacter(
      id,
      characterId,
      getUserId(req),
    );
  }

  // Spec 002 — Join-request loop ------------------------------------------

  @Post('encounters/:id/join-requests')
  async createJoinRequest(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body('characterId') characterId: string,
  ) {
    return this.joinRequestService.createRequest(
      id,
      characterId,
      getUserId(req),
    );
  }

  @Get('encounters/:id/join-requests')
  async listJoinRequests(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('status') status?: 'pending' | 'approved' | 'rejected' | 'all',
  ) {
    return this.joinRequestService.listByEncounter(
      id,
      getUserId(req),
      status ?? 'pending',
    );
  }

  @Post('encounters/:id/join-requests/:reqId/approve')
  async approveJoinRequest(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('reqId') reqId: string,
  ) {
    return this.joinRequestService.approve(id, reqId, getUserId(req));
  }

  @Post('encounters/:id/join-requests/:reqId/reject')
  async rejectJoinRequest(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('reqId') reqId: string,
    @Body('reason') reason?: string,
  ) {
    return this.joinRequestService.reject(id, reqId, getUserId(req), reason);
  }

  @Post('encounters/:id/invites')
  async inviteToEncounter(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { playerUserIds?: string[]; message?: string } = {},
  ) {
    return this.joinRequestService.createInvites(
      id,
      getUserId(req),
      body.playerUserIds,
      body.message,
    );
  }

  @Post('encounters/:id/late-join/monster')
  async lateJoinMonster(
    @Param('id') id: string,
    @Body() dto: AddMonsterDto,
  ) {
    return this.encounterService.lateJoinMonster(id, dto);
  }

  @Delete('encounters/:id/participants/:participantId')
  async removeParticipant(
    @Param('participantId') participantId: string,
  ) {
    return this.encounterService.removeParticipant(participantId);
  }

  @Post('encounters/:id/roll-initiative')
  async rollInitiative(@Param('id') id: string) {
    return this.encounterService.rollAllInitiative(id);
  }

  @Patch('encounters/:id/initiative/:participantId')
  async setManualInitiative(
    @Param('participantId') participantId: string,
    @Body('total') total: number,
  ) {
    return this.encounterService.setManualInitiative(participantId, total);
  }

  @Post('encounters/:id/start')
  async startCombat(@Param('id') id: string, @Req() req: AuthRequest) {
    const encounter = await this.encounterService.startCombat(id);
    const firstId = encounter.turnOrder?.[0];
    if (firstId) {
      const first = await this.encounterService.getParticipant(firstId);
      const session = await this.sessionService.getById(encounter.sessionId);
      const ownerId =
        first.type === 'pc' && first.characterId
          ? await this.encounterService.resolveCharacterOwner(
              first.characterId,
              getUserId(req),
              session.campaignId ?? undefined,
            )
          : getUserId(req);
      await this.movementService.initializeTurn(first, ownerId);
    }
    return this.encounterService.getById(id);
  }

  @Post('encounters/:id/end')
  async endEncounter(@Param('id') id: string) {
    return this.encounterService.endEncounter(id);
  }

  @Post('encounters/:id/resolve')
  async resolveEncounter(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: ResolveEncounterDto,
  ) {
    return this.encounterService.resolveEncounter(id, body, getUserId(req));
  }

  @Post('encounters/:id/difficulty')
  async calculateDifficulty(
    @Param('id') id: string,
    @Body('partyLevels') partyLevels: number[],
  ) {
    return this.encounterService.calculateDifficulty(id, partyLevels);
  }

  // ==================== COMBAT ====================

  @Get('encounters/:id/turn')
  async getCurrentTurn(@Param('id') id: string) {
    return this.combatService.getCurrentTurn(id);
  }

  @Post('encounters/:id/aoe-action')
  async resolveAoeAction(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body()
    body: {
      casterParticipantId: string;
      actionName: string;
      affectedParticipantIds: string[];
    },
  ) {
    return this.combatService.resolveAoeAction(id, {
      ...body,
      ownerUserId: getUserId(req),
    });
  }

  @Post('encounters/:id/attack')
  async resolveAttack(
    @Req() req: AuthRequest,
    @Param('id') id: string,
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
        code: 'MISSING_ACTION_SLUG',
        hint:
          'Use actionSlug de GET /characters/:id/combat-actions ou GET /encounters/:id/participants/:pid/actions.',
      };
    }
    // Shove/Grapple standalone foram removidos — viram sub-opções do Unarmed Strike.
    if (body.actionSlug === 'shove' || body.actionSlug === 'grapple') {
      return {
        ok: false,
        error:
          'Shove e Grapple sao sub-opcoes de Unarmed Strike (XPHB 2024).',
        code: 'USE_UNARMED_STRIKE',
        hint:
          `Use actionSlug='unarmed-strike' com options.mode='${body.actionSlug}'.`,
      };
    }

    const ownerUserId = getUserId(req);
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
        targetParticipantId: body.targetParticipantId ?? '',
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
        error: 'targetParticipantId é obrigatório para ataque simples.',
        code: 'INVALID_PAYLOAD',
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

  @Post('encounters/:id/damage')
  async applyDamage(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { targetParticipantId: string; amount: number; damageType: string; fromCriticalHit?: boolean },
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.targetParticipantId,
      getUserId(req),
      id,
    );
    return this.combatService.applyDamage(id, { ...body, ownerUserId });
  }

  @Post('encounters/:id/heal')
  async applyHealing(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { targetParticipantId: string; amount: number },
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.targetParticipantId,
      getUserId(req),
      id,
    );
    return this.combatService.applyHealing(id, { ...body, ownerUserId });
  }

  @Post('encounters/:id/condition')
  async applyCondition(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { participantId: string; condition: string; apply: boolean },
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      id,
    );
    return this.combatService.applyCondition(id, { ...body, ownerUserId });
  }

  @Get('encounters/:id/turn-actions/:participantId')
  async getTurnActions(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
  ) {
    return this.combatService.getTurnActions(
      id,
      participantId,
      getUserId(req),
    );
  }

  /**
   * Spec 003 — ActionDescriptor[] tipado do participant no encounter,
   * com action economy corrente (turno ativo, actionUsed, attacksUsedThisTurn,
   * reactionUsed) e rest state (feature_uses_used, spell_slots_used) aplicados.
   */
  @Get('encounters/:id/participants/:participantId/actions')
  async getParticipantActions(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
  ) {
    return this.combatService.getParticipantCombatActions(
      id,
      participantId,
      getUserId(req),
    );
  }

  @Post('encounters/:id/end-turn')
  async endTurn(@Param('id') id: string) {
    return this.combatService.endTurn(id);
  }

  // ==================== SPEC 004: RAW COMBAT ENDPOINTS ====================

  @Post('encounters/:id/legendary-action')
  async legendaryAction(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: LegendaryActionDto,
  ) {
    const ownerUserId = await this.permissionResolver.resolveMutationOwner(
      body.monsterParticipantId,
      getUserId(req),
      id,
    );
    const monster = await this.participantRepo.findOne({
      where: { id: body.monsterParticipantId, encounterId: id },
      relations: ['monster'],
    });
    if (!monster) return failure(GameErrorCode.PARTICIPANT_NOT_FOUND);
    const can = this.legendaryActionService.canExecute(monster, body.actionName);
    if (!can.ok) return can;
    const cost = can.value.cost;
    const spent = await this.legendaryActionService.spendPoints(
      monster,
      cost,
      body.actionName,
    );
    void ownerUserId; // resolveMutationOwner garante autorização
    return { ok: true, value: spent.result, events: spent.events };
  }

  @Post('encounters/:id/grapple-escape')
  async grappleEscape(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: GrappleEscapeDto,
  ) {
    await this.permissionResolver.resolveMutationOwner(
      body.participantId,
      getUserId(req),
      id,
    );
    const target = await this.participantRepo.findOne({
      where: { id: body.participantId, encounterId: id },
    });
    if (!target) return failure(GameErrorCode.PARTICIPANT_NOT_FOUND);
    // Modificadores simples para v1: usar bonus de proficiência fixo (refinar com character-sheet em iteração futura)
    const targetMod = body.ability === 'athletics' ? 3 : 3;
    const grapplerMod = 3;
    return this.grappleEscapeService.attemptEscape(
      target,
      body.ability,
      targetMod,
      grapplerMod,
    );
  }

  @Post('encounters/:id/lair-action')
  async lairAction(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: LairActionDto,
  ) {
    await this.permissionResolver.resolveMutationOwner(
      body.monsterParticipantId,
      getUserId(req),
      id,
    );
    const encounter = await this.encounterRepo.findOne({ where: { id } });
    if (!encounter) return failure(GameErrorCode.ENCOUNTER_NOT_FOUND);
    return this.lairActionService.execute(
      encounter,
      body.monsterParticipantId,
      body.actionIndex,
    );
  }

  @Patch('encounters/:id/in-lair')
  async setInLair(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { inLair: boolean },
  ) {
    const encounter = await this.encounterRepo.findOne({ where: { id } });
    if (!encounter) return failure(GameErrorCode.ENCOUNTER_NOT_FOUND);
    encounter.inLair = !!body.inLair;
    await this.encounterRepo.save(encounter);
    void req;
    return { ok: true, value: { inLair: encounter.inLair } };
  }

  @Delete('encounters/:id/conditions/:instanceId')
  async removeConditionInstance(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('instanceId') instanceId: string,
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
      'manual',
    );
    return { ok: true, value: { instanceId, removed: r.removed }, events: r.events };
  }

  // ==================== CONTROL TOGGLE (SPEC 003 US4) ====================

  @Patch('encounters/:id/participants/:participantId/control')
  async updateControlMode(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
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

  @Post('encounters/:id/ai-turn')
  async executeAiTurn(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { participantId: string },
  ) {
    const authUserId = getUserId(req);
    return this.aiTurnService.executeAiTurn(
      id,
      body.participantId,
      authUserId,
    );
  }

  @Get('encounters/:id/snapshot')
  async getEncounterSnapshot(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    const authUserId = getUserId(req);
    return this.snapshotService.build(id, authUserId);
  }

  // ==================== GENERIC ACTIONS (SPEC 003 US2) ====================

  @Post('encounters/:id/generic-action')
  async executeGenericAction(
    @Req() req: AuthRequest,
    @Param('id') id: string,
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
  @Post('encounters/:id/class-feature')
  async invokeClassFeature(
    @Req() req: AuthRequest,
    @Param('id') id: string,
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

  @Post('encounters/:id/death-save/:participantId')
  async resolveDeathSave(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
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

  @Post('encounters/:id/cast-spell')
  async castSpellInCombat(
    @Req() req: AuthRequest,
    @Param('id') id: string,
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
          | 'twinned'
          | 'quickened'
          | 'distant'
          | 'heightened'
          | 'extended'
          | 'subtle';
        targetExtra?: string;
        heightenedTargetId?: string;
      };
    },
  ) {
    return this.spellCastingService.castSpellInCombat({
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
    });
  }

  // ==================== MOVEMENT ====================

  @Post('encounters/:id/move')
  async moveParticipant(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { participantId: string; targetX: number; targetY: number },
  ) {
    return this.movementService.moveParticipant(
      id,
      body.participantId,
      body.targetX,
      body.targetY,
      getUserId(req),
    );
  }

  @Post('encounters/:id/dash')
  async dashAction(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { participantId: string },
  ) {
    return this.movementService.dashAction(
      id,
      body.participantId,
      getUserId(req),
    );
  }

  @Post('encounters/:id/disengage')
  async disengageAction(
    @Param('id') id: string,
    @Body() body: { participantId: string },
  ) {
    return this.movementService.disengageAction(id, body.participantId);
  }

  @Get('encounters/:id/movement/:participantId')
  async getMovementState(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
  ) {
    return this.movementService.getMovementState(
      id,
      participantId,
      getUserId(req),
    );
  }

  // ==================== MAP ====================

  @Post('encounters/:id/map/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_req, file, cb) => {
        if (/\.(jpg|jpeg|png|webp|gif)$/i.test(file.originalname)) {
          cb(null, true);
        } else {
          cb(new Error('Apenas imagens (jpg, png, webp, gif)'), false);
        }
      },
    }),
  )
  async uploadMapBackground(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const result = await this.cloudinaryService.uploadBuffer(
      file.buffer,
      'maps',
    );
    return this.encounterService.updateMapData(id, {
      backgroundUrl: result.secure_url,
    });
  }

  @Patch('encounters/:id/map')
  async updateMapData(
    @Param('id') id: string,
    @Body() body: {
      gridSize?: number;
      gridColumns?: number;
      gridRows?: number;
      gridVisible?: boolean;
      gridColor?: string;
    },
  ) {
    return this.encounterService.updateMapData(id, body);
  }

  @Patch('encounters/:id/participants/positions')
  async batchUpdatePositions(
    @Param('id') id: string,
    @Body('positions') positions: BatchPositionDto[],
  ) {
    return this.encounterService.batchUpdatePositions(id, positions);
  }

  @Patch('encounters/:id/participants/:participantId/position')
  async updateParticipantPosition(
    @Param('participantId') participantId: string,
    @Body() body: { x: number; y: number },
  ) {
    return this.encounterService.updateParticipantPosition(
      participantId,
      body.x,
      body.y,
    );
  }

  @Patch('encounters/:id/participants/:participantId/visibility')
  async updateParticipantVisibility(
    @Param('participantId') participantId: string,
    @Body() body: { visible: boolean },
  ) {
    return this.encounterService.updateParticipantVisibility(
      participantId,
      body.visible,
    );
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
  @Post('encounters/:id/participants/:participantId/arm-inspiration')
  async armInspiration(
    @Param('participantId') participantId: string,
    @Body() body: { arm: boolean },
  ) {
    return this.encounterService.armInspiration(participantId, body.arm);
  }

  @Post('encounters/:id/participants/:participantId/grant-inspiration')
  async grantInspiration(
    @Param('participantId') participantId: string,
    @Body() body: { grant: boolean },
  ) {
    return this.encounterService.grantInspiration(participantId, body.grant);
  }

  /**
   * Fighting Style Interception (RAW 2024) — reação reduz dano de aliado
   * adjacente em 1d10+PB. Consome reaction.
   */
  @Post('encounters/:id/participants/:participantId/fighting-style/interception')
  async fsInterception(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') fighterParticipantId: string,
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
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Fighting Style Protection (RAW 2024) — reação impõe disadvantage no
   * próximo attack contra aliado adjacente. Requer shield. Consome reaction.
   */
  @Post('encounters/:id/participants/:participantId/fighting-style/protection')
  async fsProtection(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') fighterParticipantId: string,
    @Body() body: { allyParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.fsReactions.protection(
      userId,
      encounterId,
      fighterParticipantId,
      body.allyParticipantId,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Fighter L2 Tactical Mind (RAW 2024) — endpoint dedicado pra reroll de
   * failed ability check. Input: total original + DC. Rola 1d10 + soma.
   * Consome Second Wind use só se passou.
   */
  @Post('encounters/:id/participants/:participantId/tactical-mind')
  async tacticalMind(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
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
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Battle Master Trip Attack (RAW 2024) — hit → spend superiority die,
   * target STR save, falha = Prone.
   */
  @Post('encounters/:id/participants/:participantId/maneuver/trip-attack')
  async maneuverTripAttack(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { targetParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.battleMaster.tripAttack(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Battle Master Precision Attack (RAW 2024) — adiciona superiority die ao
   * attack roll total. Chamado após attack falhar; backend retorna newTotal.
   */
  @Post('encounters/:id/participants/:participantId/maneuver/precision-attack')
  async maneuverPrecisionAttack(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { originalAttackTotal: number },
  ) {
    const userId = getUserId(req);
    const result = await this.battleMaster.precisionAttack(
      userId,
      encounterId,
      participantId,
      body.originalAttackTotal,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Cleric L5 Sear Undead (RAW 2024) — CD + Magic action. Undead 30ft CON
   * save DC 8+WIS+PB. Falha = 10+5×(L-5) radiant; sucesso half.
   */
  @Post('encounters/:id/participants/:participantId/cleric/sear-undead')
  async clericSearUndead(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { targetParticipantIds: string[] },
  ) {
    const userId = getUserId(req);
    const result = await this.clericFeatures.searUndead(
      userId,
      encounterId,
      participantId,
      body.targetParticipantIds,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Paladin L1 Divine Smite (RAW 2024) — spell Bonus Action pós hit melee/unarmed.
   * Base 2d8 + (slotLevel-1)×1d8 radiant (cap 5d8 em slot 4+). +1d8 se Fiend/Undead.
   * Crit dobra. freeCast=true usa Paladin's Smite L2 (sem slot).
   */
  @Post('encounters/:id/participants/:participantId/paladin/divine-smite')
  async paladinDivineSmite(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: {
      targetParticipantId: string;
      slotLevel: number;
      hitWasCritical: boolean;
      targetType: 'fiend' | 'undead' | null;
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
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Paladin L11 Radiant Strikes (RAW 2024) — +1d8 radiant passive em melee/unarmed hit.
   */
  @Post('encounters/:id/participants/:participantId/paladin/radiant-strikes')
  async paladinRadiantStrikes(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { targetParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.paladinFeatures.radiantStrikes(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Sorcerer L2+ Font of Magic — pool de Sorcery Points.
   * GET retorna {total, used, remaining}.
   */
  @Get('encounters/:id/participants/:participantId/sorcerer/sorcery-points')
  async sorcererGetSorceryPoints(
    @Req() req: AuthRequest,
    @Param('participantId') participantId: string,
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
  @Post('encounters/:id/participants/:participantId/sorcerer/convert-slot-to-sp')
  async sorcererConvertSlotToSp(
    @Req() req: AuthRequest,
    @Param('participantId') participantId: string,
    @Body() body: { slotLevel: number },
  ) {
    const userId = getUserId(req);
    const result = await this.sorcererFeatures.convertSlotToSp(
      participantId,
      body.slotLevel,
      userId,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value, events: result.events };
  }

  /**
   * Sorcerer L2+ Font of Magic — converte SP em 1 spell slot (RAW: L1=2/L2=3/L3=5/L4=6/L5=7).
   */
  @Post('encounters/:id/participants/:participantId/sorcerer/convert-sp-to-slot')
  async sorcererConvertSpToSlot(
    @Req() req: AuthRequest,
    @Param('participantId') participantId: string,
    @Body() body: { targetSlotLevel: number },
  ) {
    const userId = getUserId(req);
    const result = await this.sorcererFeatures.convertSpToSlot(
      participantId,
      body.targetSlotLevel,
      userId,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value, events: result.events };
  }

  /**
   * Sorcerer L5+ Sorcerous Restoration — 1/LR uso em SR recupera
   * floor(classLevel/2) SP.
   */
  @Post('encounters/:id/participants/:participantId/sorcerer/sorcerous-restoration')
  async sorcererSorcerousRestoration(
    @Req() req: AuthRequest,
    @Param('participantId') participantId: string,
  ) {
    const userId = getUserId(req);
    const result = await this.sorcererFeatures.sorcerousRestoration(
      participantId,
      userId,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value, events: result.events };
  }

  /**
   * Paladin Devotion L3 Sacred Weapon (RAW 2024 CD) — arma +CHA attack + radiant
   * damage + luz 20ft por 1 min (10 rounds).
   */
  @Post('encounters/:id/participants/:participantId/paladin/sacred-weapon')
  async paladinSacredWeapon(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
  ) {
    const userId = getUserId(req);
    const result = await this.paladinFeatures.sacredWeapon(
      userId,
      encounterId,
      participantId,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Cleric Life Domain L3 Preserve Life (RAW 2024 CD) — distribui pool 5×level
   * HP entre aliados 30ft, cap individual = pool/2.
   */
  @Post('encounters/:id/participants/:participantId/cleric/preserve-life')
  async clericPreserveLife(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { allocations: Array<{ targetParticipantId: string; hp: number }> },
  ) {
    const userId = getUserId(req);
    const result = await this.clericFeatures.preserveLife(
      userId,
      encounterId,
      participantId,
      body.allocations,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Cleric L7 Blessed Strikes (RAW 2024) — 1/turn melee hit OR cantrip save-fail
   * → +1d8 radiant (+2d8 em L14 Improved).
   */
  @Post('encounters/:id/participants/:participantId/cleric/blessed-strikes')
  async clericBlessedStrikes(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { targetParticipantId: string; trigger: 'melee-hit' | 'cantrip-save-failed' },
  ) {
    const userId = getUserId(req);
    const result = await this.clericFeatures.blessedStrikes(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
      body.trigger,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Cleric L10 Divine Intervention (RAW 2024) — Magic action, auto-sucesso.
   * Cap slot L5 em L10-L19, L9 em L20 (Greater).
   */
  @Post('encounters/:id/participants/:participantId/cleric/divine-intervention')
  async clericDivineIntervention(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
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
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Berserker L3 Frenzy (RAW 2024) — primeiro hit do turno em rage+reckless
   * ganha +Nd6 damage. Chamado após hit confirmado.
   */
  @Post('encounters/:id/participants/:participantId/berserker/frenzy')
  async berserkerFrenzy(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { targetParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.berserker.frenzy(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Berserker L10 Retaliation (RAW 2024) — reaction melee attack contra
   * atacante adjacente que causou dano.
   */
  @Post('encounters/:id/participants/:participantId/berserker/retaliation')
  async berserkerRetaliation(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { targetParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.berserker.retaliation(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Berserker L14 Intimidating Presence (RAW 2024) — Bonus action, 30ft
   * emanation, cada target WIS save DC 8+STR+PB. Falha = Frightened 1min.
   */
  @Post('encounters/:id/participants/:participantId/berserker/intimidating-presence')
  async berserkerIntimidatingPresence(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { targetParticipantIds: string[] },
  ) {
    const userId = getUserId(req);
    const result = await this.berserker.intimidatingPresence(
      userId,
      encounterId,
      participantId,
      body.targetParticipantIds,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Barbarian L11 Relentless Rage (RAW 2024) — PC em rage caiu a 0 HP.
   * CON save DC 10+5×uses. Passa: volta 1 HP + consome use.
   */
  @Post('encounters/:id/participants/:participantId/relentless-rage')
  async barbarianRelentlessRage(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
  ) {
    const userId = getUserId(req);
    const result = await this.barbarianFeatures.relentlessRage(
      userId,
      encounterId,
      participantId,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Barbarian L18 Indomitable Might (RAW 2024) — STR check < score, usa score.
   */
  @Post('encounters/:id/participants/:participantId/indomitable-might')
  async barbarianIndomitableMight(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { rawCheckTotal: number; abilitySlug: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' },
  ) {
    const userId = getUserId(req);
    const result = await this.barbarianFeatures.indomitableMight(
      userId,
      encounterId,
      participantId,
      body.rawCheckTotal,
      body.abilitySlug,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Barbarian L9 Brutal Strike (RAW 2024) — Forceful Blow: +Nd10 damage +
   * target push 10ft + attacker move ½ speed. Exige Rage ativo.
   */
  @Post('encounters/:id/participants/:participantId/brutal-strike/forceful-blow')
  async brutalStrikeForcefulBlow(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { targetParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.brutalStrike.forcefulBlow(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Barbarian L9 Brutal Strike (RAW 2024) — Hamstring Blow: +Nd10 damage +
   * target speed -15ft até fim do próximo turno. Exige Rage ativo.
   */
  @Post('encounters/:id/participants/:participantId/brutal-strike/hamstring-blow')
  async brutalStrikeHamstringBlow(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { targetParticipantId: string },
  ) {
    const userId = getUserId(req);
    const result = await this.brutalStrike.hamstringBlow(
      userId,
      encounterId,
      participantId,
      body.targetParticipantId,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Fighter L9 Tactical Master (RAW 2024) — arma mastery alternativa
   * (push/sap/slow) pro próximo attack. Combat.service consome o override.
   */
  @Post('encounters/:id/participants/:participantId/tactical-master/arm')
  async tacticalMasterArm(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { masteryOverride: 'push' | 'sap' | 'slow' },
  ) {
    const userId = getUserId(req);
    const result = await this.tacticalFeatures.tacticalMasterArm(
      userId,
      encounterId,
      participantId,
      body.masteryOverride,
    );
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    return { ok: true, value: result.value };
  }

  /**
   * Premissa weapons-in-hand — Sacar/Guardar arma em combate.
   * Consome 1× free object interaction por turno (RAW 2024). Delega pro
   * inventory.service pra aplicar o swap + valida limite no participant.
   */
  @Post('encounters/:id/participants/:participantId/swap-hand')
  async swapHand(
    @Req() req: AuthRequest,
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { equipmentId: string; hand: 'main' | 'off' | null },
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

  @Get('sessions/:id/events')
  async getSessionEvents(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.eventService.getSessionTimeline(
      id,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get('encounters/:id/events')
  async getEncounterEvents(
    @Param('id') id: string,
    @Query() query: GetEventsQueryDto,
  ) {
    // Validar tipos de evento se fornecidos
    let eventTypes: string[] | undefined;
    if (query.type) {
      const requestedTypes = query.type.split(',').map((t) => t.trim());
      const invalidTypes = requestedTypes.filter(
        (t) => !(VALID_EVENT_TYPES as readonly string[]).includes(t),
      );
      if (invalidTypes.length > 0) {
        return failure(
          `Tipo de evento invalido: '${invalidTypes.join("', '")}'. Tipos validos: ${VALID_EVENT_TYPES.slice(0, 10).join(', ')}, ...`,
          'INVALID_PAYLOAD' as GameErrorCode,
        );
      }
      // Converter camelCase → snake_case para filtrar no DB
      eventTypes = requestedTypes.map(camelToSnakeCase);
    }

    const { events, total } = await this.eventService.getEncounterTimelineFiltered(
      id,
      {
        since: query.since,
        eventTypes,
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
      },
    );

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

  @Post('quests/:questId/resolve')
  async resolveQuest(
    @Req() req: AuthRequest,
    @Param('questId') questId: string,
    @Body() body: {
      status: 'completed' | 'failed';
      xpRewards: Array<{ characterId: string; xp: number }>;
      goldRewards: Array<{ characterId: string; gp: number }>;
      itemRewards: Array<{ characterId: string; equipmentId?: string; magicItemId?: string }>;
    },
  ) {
    const userId = getUserId(req);

    // Update quest status
    await this.questService.update(questId, { status: body.status });

    // Apply XP
    const xpApplied: Array<{ characterId: string; xp: number; newTotal: number; levelUpAvailable: boolean }> = [];
    for (const reward of body.xpRewards) {
      if (reward.xp <= 0) continue;
      try {
        const result = await this.stateService.updateXp(userId, reward.characterId, { amount: reward.xp });
        xpApplied.push({ characterId: reward.characterId, xp: reward.xp, newTotal: result.xp, levelUpAvailable: result.levelUpAvailable });
      } catch {}
    }

    // Apply Gold
    const goldApplied: Array<{ characterId: string; gp: number }> = [];
    for (const reward of body.goldRewards) {
      if (reward.gp <= 0) continue;
      try {
        await this.inventoryService.updateGold(userId, reward.characterId, { gp: reward.gp });
        goldApplied.push({ characterId: reward.characterId, gp: reward.gp });
      } catch {}
    }

    // Apply Items
    const itemsApplied: Array<{ characterId: string; itemName: string }> = [];
    for (const reward of body.itemRewards) {
      try {
        if (reward.equipmentId) {
          const result = await this.inventoryService.addItem(userId, reward.characterId, {
            equipmentId: reward.equipmentId,
            source: EquipmentSourceEnum.Loot,
          });
          itemsApplied.push({ characterId: reward.characterId, itemName: (result as any).equipment?.name ?? 'Item' });
        }
        if (reward.magicItemId) {
          await this.inventoryService.addMagicItem(userId, reward.characterId, { magicItemId: reward.magicItemId });
          itemsApplied.push({ characterId: reward.characterId, itemName: 'Magic Item' });
        }
      } catch {}
    }

    return { xpApplied, goldApplied, itemsApplied };
  }

  // ==================== ENCOUNTERS BY USER ====================

  @Get('encounters/mine')
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

  @Post('dice/roll')
  async rollDice(@Body('expression') expression: string) {
    return this.diceService.rollExpression(expression);
  }

  /**
   * Ativa seed determinístico no DiceService (spec 012).
   * Admin-only, bloqueado em produção (exceto com ALLOW_TEST_ENDPOINTS=true).
   */
  @Post('dice/seed')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard, NonProductionGuard)
  async setDiceSeed(@Body() dto: DiceSeedDto) {
    this.diceService.setSeed(dto.value);
    return { seedActive: true, value: dto.value };
  }

  /**
   * Desativa seed, volta a Math.random (spec 012).
   */
  @Post('dice/seed/clear')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard, NonProductionGuard)
  async clearDiceSeed() {
    this.diceService.clearSeed();
    return { seedActive: false };
  }

  // ==================== SKILL CHECKS ====================

  @Post('skill-check')
  async rollSkillCheck(@Body() dto: SkillCheckDto, @Req() req: AuthRequest) {
    const result = await this.skillCheckService.rollAbilityCheck({
      ...dto,
      userId: getUserId(req),
    });
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    if (dto.sessionId) {
      await this.eventService.emit(dto.sessionId, dto.encounterId ?? null, result.events);
    }
    return { ok: true, value: result.value };
  }

  // ==================== SAVING THROWS ====================

  @Post('saving-throw')
  async rollSavingThrow(@Body() dto: SavingThrowDto, @Req() req: AuthRequest) {
    const result = await this.savingThrowService.rollSavingThrow({
      ...dto,
      userId: getUserId(req),
    });
    if (!result.ok) return { ok: false, error: result.error, code: result.code };
    if (dto.sessionId) {
      await this.eventService.emit(dto.sessionId, dto.encounterId ?? null, result.events);
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
  @Post('encounters/:id/participants/:participantId/wild-shape/enter')
  async wildShapeEnter(
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
    @Body() body: { monsterSlug: string; formDisplayName?: string },
  ) {
    try {
      const updated = await this.transformationService.enterForm(participantId, {
        source: 'wild-shape',
        monsterSlug: body.monsterSlug,
        formDisplayName: body.formDisplayName,
        durationRoundsTotal: 600, // 1h RAW = 600 rounds (6 seg cada)
        retainedAbilities: ['mental-stats', 'speech', 'class-features'],
        equipmentHandling: 'merge',
        revertTriggers: { hpZero: true, durationEnd: true, playerDismiss: true, concentrationBroken: false },
      });
      return {
        ok: true,
        value: {
          participantId: updated.id,
          displayName: updated.displayName,
          form: updated.transformationState?.form,
        },
      };
    } catch (err) {
      const e = err as { message?: string };
      return { ok: false, error: e.message ?? 'UNKNOWN', code: 'WILD_SHAPE_ERROR' };
    }
  }

  /**
   * Reverte transformação (Wild Shape, Polymorph, etc). Player dismiss manual.
   */
  @Post('encounters/:id/participants/:participantId/wild-shape/revert')
  async wildShapeRevert(
    @Param('id') encounterId: string,
    @Param('participantId') participantId: string,
  ) {
    const updated = await this.transformationService.revertForm(
      participantId,
      'player-dismiss',
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
}
