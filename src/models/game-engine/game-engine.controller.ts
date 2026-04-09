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
import { SessionService } from './services/session.service';
import type { CreateSessionDto, UpdateSessionDto } from './services/session.service';
import { EncounterService } from './services/encounter.service';
import type { CreateEncounterDto, AddMonsterDto } from './services/encounter.service';
import { CombatService } from './services/combat.service';
import type { AttackDto, DamageDto, HealDto, ConditionDto } from './services/combat.service';
import { EventService } from './services/event.service';
import { DiceService } from './services/dice.service';

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
    private readonly eventService: EventService,
    private readonly diceService: DiceService,
  ) {}

  // ==================== SESSIONS ====================

  @Post('sessions')
  async createSession(
    @Req() req: AuthRequest,
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionService.create(getUserId(req), dto);
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
    await this.sessionService.ensureOwnership(id, getUserId(req));
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
    await this.sessionService.ensureOwnership(sessionId, getUserId(req));
    return this.encounterService.create(sessionId, dto);
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
  async startCombat(@Param('id') id: string) {
    return this.encounterService.startCombat(id);
  }

  @Post('encounters/:id/end')
  async endEncounter(@Param('id') id: string) {
    return this.encounterService.endEncounter(id);
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

  @Post('encounters/:id/attack')
  async resolveAttack(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body()
    body: {
      attackerParticipantId: string;
      targetParticipantId: string;
      actionName: string;
      forceAdvantage?: boolean;
      forceDisadvantage?: boolean;
    },
  ) {
    return this.combatService.resolveAttack(id, {
      ...body,
      ownerUserId: getUserId(req),
    });
  }

  @Post('encounters/:id/damage')
  async applyDamage(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { targetParticipantId: string; amount: number; damageType: string },
  ) {
    return this.combatService.applyDamage(id, {
      ...body,
      ownerUserId: getUserId(req),
    });
  }

  @Post('encounters/:id/heal')
  async applyHealing(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { targetParticipantId: string; amount: number },
  ) {
    return this.combatService.applyHealing(id, {
      ...body,
      ownerUserId: getUserId(req),
    });
  }

  @Post('encounters/:id/condition')
  async applyCondition(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { participantId: string; condition: string; apply: boolean },
  ) {
    return this.combatService.applyCondition(id, {
      ...body,
      ownerUserId: getUserId(req),
    });
  }

  @Post('encounters/:id/end-turn')
  async endTurn(@Param('id') id: string) {
    return this.combatService.endTurn(id);
  }

  @Post('encounters/:id/death-save/:participantId')
  async resolveDeathSave(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
  ) {
    return this.combatService.resolveDeathSave(
      id,
      participantId,
      getUserId(req),
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

  // ==================== DICE ====================

  @Post('dice/roll')
  async rollDice(@Body('expression') expression: string) {
    return this.diceService.rollExpression(expression);
  }
}
