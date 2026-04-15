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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CloudinaryService } from 'src/shared/cloudinary.service';
import { QuestService } from '../world/services/quest.service';
import { CharacterStateService } from '../characters/services/character-state.service';
import { InventoryService } from '../characters/services/inventory.service';
import { EquipmentSourceEnum } from 'src/entities/enums';
import { AuthGuard } from '../auth/auth.guard';
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
    return this.encounterService.getById(id);
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
    @Body() body: {
      outcome: 'victory' | 'retreat' | 'negotiation' | 'defeat';
      xpRewards: Array<{ characterId: string; xp: number }>;
      goldRewards: Array<{ characterId: string; gp: number }>;
      itemRewards: Array<{ characterId: string; equipmentId?: string; magicItemId?: string }>;
    },
  ) {
    return this.encounterService.resolveEncounter(id, {
      ...body,
      ownerUserId: getUserId(req),
    });
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
      targetParticipantIds: string[];
    },
  ) {
    return this.spellCastingService.castSpellInCombat({
      encounterId: id,
      participantId: body.participantId,
      spellSlug: body.spellSlug,
      slotLevel: body.slotLevel,
      targetParticipantIds: body.targetParticipantIds,
      ownerUserId: getUserId(req),
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
  async getEncounterEvents(@Param('id') id: string) {
    return this.eventService.getEncounterTimeline(id);
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
}
