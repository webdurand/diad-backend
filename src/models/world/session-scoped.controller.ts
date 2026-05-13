import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";

function extractTraceId(traceparent: string | undefined): string | undefined {
  if (!traceparent) return undefined;
  const parts = traceparent.split("-");
  if (parts.length < 4) return undefined;
  const traceId = parts[1];
  if (!/^[0-9a-f]{32}$/.test(traceId)) return undefined;
  return traceId;
}
import { AuthGuard } from "../auth/auth.guard";
import { CampaignService } from "./services/campaign.service";
import { SessionService } from "../game-engine/services/session.service";
import { NpcService } from "./services/npc.service";
import { QuestService } from "./services/quest.service";
import {
  SessionNpcStateService,
  type UpsertNpcStateDto,
} from "./services/session-npc-state.service";
import {
  SessionFactionStateService,
  type UpsertFactionStateDto,
} from "./services/session-faction-state.service";
import {
  SessionStoryArcStateService,
  type UpsertStoryArcStateDto,
  type StoryArcPhase,
} from "./services/session-story-arc-state.service";
import {
  ChaosFactorService,
  type ChaosSource,
} from "./services/chaos-factor.service";
import { isDmOmniscient } from "./services/npc-projection";
import type { CreateQuestDto, UpdateQuestDto } from "./services/quest.service";

interface AuthRequest extends Request {
  user?: { id: string; email: string; name?: string };
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException("Usuario nao autenticado.");
  return id;
}


@Controller("sessions")
@UseGuards(AuthGuard)
export class SessionScopedWorldController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly campaignService: CampaignService,
    private readonly npcService: NpcService,
    private readonly questService: QuestService,
    private readonly npcStateService: SessionNpcStateService,
    private readonly factionStateService: SessionFactionStateService,
    private readonly arcStateService: SessionStoryArcStateService,
    private readonly chaosFactorService: ChaosFactorService,
  ) {}

  private async ensureDm(
    sessionId: string,
    userId: string,
  ): Promise<{ campaignId?: string }> {
    const session = await this.sessionService.ensureAccess(sessionId, userId);
    if (session.campaignId) {
      await this.campaignService.ensureDmOwnership(session.campaignId, userId);
    }
    return { campaignId: session.campaignId };
  }



  @Get(":sessionId/npcs")
  async listSessionNpcs(
    @Req() req: AuthRequest,
    @Headers() headers: Record<string, string>,
    @Param("sessionId") sessionId: string,
  ) {
    await this.sessionService.ensureAccess(sessionId, getUserId(req));
    return this.npcService.listForSessionProjected(sessionId, {
      dmOmniscient: isDmOmniscient(headers),
    });
  }

  @Post(":sessionId/npcs/materialize")
  async materializeNpc(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Body()
    body: {
      name: string;
      descriptor?: string;
      disposition?: "friendly" | "neutral" | "hostile" | "indifferent";
    },
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    return this.npcService.materializeStubFromName(
      sessionId,
      body.name,
      body.descriptor,
      body.disposition ?? "neutral",
    );
  }

  @Patch(":sessionId/npcs/:npcId/state")
  async upsertNpcState(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Param("npcId") npcId: string,
    @Body() dto: UpsertNpcStateDto,
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    return this.npcStateService.upsert(sessionId, npcId, dto);
  }

  @Patch(":sessionId/npcs/:npcId/move")
  async moveNpc(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Param("npcId") npcId: string,
    @Body("locationId") locationId: string | null,
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    return this.npcService.moveNpc(sessionId, npcId, locationId);
  }



  @Patch(":sessionId/factions/:factionId/state")
  async upsertFactionState(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Param("factionId") factionId: string,
    @Body() dto: UpsertFactionStateDto,
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    return this.factionStateService.upsert(sessionId, factionId, dto);
  }

  @Get(":sessionId/factions/state")
  async listFactionStates(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
  ) {
    await this.sessionService.ensureAccess(sessionId, getUserId(req));
    return this.factionStateService.listBySession(sessionId);
  }



  @Patch(":sessionId/story-arcs/:arcId/state")
  async upsertArcState(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Param("arcId") arcId: string,
    @Body() dto: UpsertStoryArcStateDto,
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    return this.arcStateService.upsert(sessionId, arcId, dto);
  }

  @Patch(":sessionId/story-arcs/:arcId/phase")
  async advanceArcPhase(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Param("arcId") arcId: string,
    @Body("phase") phase: StoryArcPhase,
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    return this.arcStateService.advancePhase(sessionId, arcId, phase);
  }

  @Get(":sessionId/story-arcs/state")
  async listArcStates(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
  ) {
    await this.sessionService.ensureAccess(sessionId, getUserId(req));
    return this.arcStateService.listBySession(sessionId);
  }




  @Patch(":sessionId/chaos")
  async setChaos(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Body() body: { value: number; source: ChaosSource },
    @Headers("traceparent") traceparent?: string,
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    const traceId = extractTraceId(traceparent);
    return this.chaosFactorService.setChaosFactor(
      sessionId,
      body.value,
      body.source,
      { traceId },
    );
  }



  @Post(":sessionId/quests")
  async createQuest(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Body() dto: CreateQuestDto,
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    return this.questService.create(sessionId, dto);
  }

  @Get(":sessionId/quests")
  async listQuests(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Query("status") status?: string,
  ) {
    await this.sessionService.ensureAccess(sessionId, getUserId(req));
    return this.questService.listBySession(sessionId, status);
  }

  @Get(":sessionId/quests/available")
  async getAvailableQuests(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
  ) {
    await this.sessionService.ensureAccess(sessionId, getUserId(req));
    return this.questService.getAvailableQuests(sessionId);
  }

  @Patch(":sessionId/quests/:qId")
  async updateQuest(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Param("qId") qId: string,
    @Body() dto: UpdateQuestDto,
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    return this.questService.update(qId, dto);
  }

  @Patch(":sessionId/quests/:qId/objectives/:oId")
  async updateObjectiveStatus(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Param("oId") oId: string,
    @Body("status") status: string,
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    return this.questService.updateObjectiveStatus(oId, status as any);
  }

  @Post(":sessionId/quests/:slug/reveal")
  async revealQuest(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Param("slug") slug: string,
    @Body() body: { evidence?: string },
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    return this.questService.revealQuest(
      sessionId,
      slug,
      body.evidence ?? null,
    );
  }

  @Post(":sessionId/quests/:slug/advance-objective")
  async advanceObjective(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Param("slug") slug: string,
    @Body()
    body: {
      objectiveIdx: number;
      newStatus: "completed" | "failed";
      evidence?: string;
    },
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    return this.questService.advanceObjective(
      sessionId,
      slug,
      body.objectiveIdx,
      body.newStatus,
      body.evidence ?? null,
    );
  }

  @Delete(":sessionId/quests/:qId")
  async removeQuest(
    @Req() req: AuthRequest,
    @Param("sessionId") sessionId: string,
    @Param("qId") qId: string,
  ) {
    await this.ensureDm(sessionId, getUserId(req));
    await this.questService.remove(qId);
    return { ok: true };
  }
}
