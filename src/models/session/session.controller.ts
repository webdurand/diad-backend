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
import { SceneService } from './services/scene.service';
import { EventLogService } from './services/event-log.service';
import { ChronicleService } from './services/chronicle.service';
import { SceneContextService } from './services/scene-context.service';
import type { CreateSceneDto } from './services/scene.service';
import type { LogEventDto, } from './services/event-log.service';
import type { CreateChronicleDto, RecordKnowledgeDto } from './services/chronicle.service';

interface AuthRequest extends Request {
  user?: { id: string; email: string; name?: string; username?: string };
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException('Usuario nao autenticado.');
  return id;
}

@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionController {
  constructor(
    private readonly sceneService: SceneService,
    private readonly eventLogService: EventLogService,
    private readonly chronicleService: ChronicleService,
    private readonly sceneContextService: SceneContextService,
  ) {}

  // ==================== SCENES ====================

  @Post(':sessionId/scenes')
  async createScene(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateSceneDto,
  ) {
    return this.sceneService.create(sessionId, dto);
  }

  @Get(':sessionId/scenes')
  async listScenes(@Param('sessionId') sessionId: string) {
    return this.sceneService.listBySession(sessionId);
  }

  @Get(':sessionId/scenes/active')
  async getActiveScene(@Param('sessionId') sessionId: string) {
    return this.sceneService.getActive(sessionId);
  }

  @Patch(':sessionId/scenes/:sceneId')
  async updateScene(
    @Param('sceneId') sceneId: string,
    @Body() dto: Partial<CreateSceneDto>,
  ) {
    return this.sceneService.update(sceneId, dto);
  }

  @Post(':sessionId/scenes/:sceneId/npcs')
  async addNpcToScene(
    @Param('sceneId') sceneId: string,
    @Body('npcId') npcId: string,
  ) {
    return this.sceneService.addNpcToScene(sceneId, npcId);
  }

  @Delete(':sessionId/scenes/:sceneId/npcs/:npcId')
  async removeNpcFromScene(
    @Param('sceneId') sceneId: string,
    @Param('npcId') npcId: string,
  ) {
    return this.sceneService.removeNpcFromScene(sceneId, npcId);
  }

  // ==================== EVENTS ====================

  @Get(':sessionId/events')
  async getSessionEvents(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.eventLogService.getSessionEvents(
      sessionId,
      limit ? parseInt(limit, 10) : 100,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Post(':sessionId/events')
  async logEvent(
    @Param('sessionId') sessionId: string,
    @Body() body: Omit<LogEventDto, 'sessionId'>,
  ) {
    return this.eventLogService.logEvent({ ...body, sessionId });
  }

  // ==================== CONTEXT (for AI) ====================

  @Get(':sessionId/context')
  async getSceneContext(@Param('sessionId') sessionId: string) {
    const scene = await this.sceneService.getActive(sessionId);
    if (!scene) return { scene: {}, npcsPresent: [], recentEvents: [], partyKnowledge: [], locationChain: [], recentChronicles: [] };
    return this.sceneContextService.assembleContext(scene.id);
  }

  // ==================== CHRONICLES ====================

  @Get('campaigns/:campaignId/chronicle')
  async getChronicles(
    @Param('campaignId') campaignId: string,
    @Query('limit') limit?: string,
    @Query('minSignificance') minSig?: string,
  ) {
    return this.chronicleService.getChronicles(
      campaignId,
      limit ? parseInt(limit, 10) : 20,
      minSig ? parseInt(minSig, 10) : 1,
    );
  }

  @Post('campaigns/:campaignId/chronicle')
  async createChronicle(
    @Param('campaignId') campaignId: string,
    @Body() body: Omit<CreateChronicleDto, 'campaignId'>,
  ) {
    return this.chronicleService.createChronicle({ ...body, campaignId });
  }

  // ==================== KNOWLEDGE ====================

  @Get('campaigns/:campaignId/knowledge')
  async getKnowledge(@Param('campaignId') campaignId: string) {
    return this.chronicleService.getKnowledge(campaignId);
  }

  @Post('campaigns/:campaignId/knowledge')
  async recordKnowledge(
    @Param('campaignId') campaignId: string,
    @Body() body: Omit<RecordKnowledgeDto, 'campaignId'>,
  ) {
    return this.chronicleService.recordKnowledge({ ...body, campaignId });
  }
}
