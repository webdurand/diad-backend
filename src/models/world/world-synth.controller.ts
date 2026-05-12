import {
  Body,
  Controller,
  forwardRef,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AiProxyService } from "../ai-proxy/ai-proxy.service";
import { CampaignService } from "./services/campaign.service";
import { CampaignIdPipe } from "./pipes/campaign-id.pipe";

interface AuthRequest extends Request {
  user?: { id: string; email: string; name?: string; username?: string };
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException("Usuario nao autenticado.");
  return id;
}

interface BootstrapBody {
  description: string;
  tone?: string;
  adventureType?: string;
  customPrompt?: string;
}

interface SynthGranularBody {
  name?: string;
  title?: string;
  type_hint?: string;
  parent_name?: string | null;
  role_hint?: string;
  faction_slug?: string | null;
  category_hint?: string;
  context?: Record<string, unknown>;
  custom_prompt?: string;
}

interface CompleteBody {
  context: Record<string, unknown>;
}

/**
 * Spec NNN — Synthesis endpoints (proxies pra diad-agents /world-synth/*).
 *
 * 6 rotas alinhadas com o wizard de criação de mundo:
 *   POST /campaigns/synthesize-bootstrap         (sem :id — pre-create scaffold)
 *   POST /campaigns/:id/synthesize-npc
 *   POST /campaigns/:id/synthesize-location
 *   POST /campaigns/:id/synthesize-lore
 *   POST /campaigns/:id/synthesize-faction
 *   POST /campaigns/:id/synthesize-complete       (completion + narrative scaffold)
 *
 * Auth: AuthGuard + ownership check (campaign deve ser do user).
 */
@Controller("campaigns")
@UseGuards(AuthGuard)
export class WorldSynthController {
  constructor(
    @Inject(forwardRef(() => AiProxyService))
    private readonly aiProxy: AiProxyService,
    private readonly campaignService: CampaignService,
  ) {}

  /**
   * Haiku 4.5 — gera seed bruto a partir de descrição livre.
   * Não persiste — frontend chama, edita e depois cria campaign + items.
   * Timeout 100s — Haiku com 4k tokens cap pode levar 60-80s no pior caso.
   * Estrutura narrativa (story arc/clocks/quests) fica pra synthesize-complete
   * no [Salvar mundo].
   */
  @Post("synthesize-bootstrap")
  async bootstrap(
    @Req() req: AuthRequest,
    @Body() body: BootstrapBody,
  ): Promise<{
    seed: Record<string, unknown>;
    preview: Record<string, unknown>;
  }> {
    getUserId(req); // só valida auth
    return this.aiProxy.requestAgent(
      "POST",
      "/world-synth/bootstrap",
      {
        description: body.description,
        tone: body.tone ?? "epico",
        adventure_type: body.adventureType ?? "exploracao",
        custom_prompt: body.customPrompt ?? "",
      },
      { timeoutMs: 100_000 },
    );
  }

  @Post(":id/synthesize-npc")
  async npc(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: SynthGranularBody,
  ): Promise<{ npc: Record<string, unknown> }> {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.aiProxy.requestAgent(
      "POST",
      "/world-synth/npc",
      {
        name: body.name,
        role_hint: body.role_hint ?? "ally_friendly",
        faction_slug: body.faction_slug ?? null,
        context: body.context ?? null,
        custom_prompt: body.custom_prompt ?? "",
      },
      { timeoutMs: 45_000 },
    );
  }

  @Post(":id/synthesize-location")
  async location(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: SynthGranularBody,
  ): Promise<{ location: Record<string, unknown> }> {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.aiProxy.requestAgent(
      "POST",
      "/world-synth/location",
      {
        name: body.name,
        type_hint: body.type_hint ?? "building",
        parent_name: body.parent_name ?? null,
        context: body.context ?? null,
        custom_prompt: body.custom_prompt ?? "",
      },
      { timeoutMs: 45_000 },
    );
  }

  @Post(":id/synthesize-lore")
  async lore(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: SynthGranularBody,
  ): Promise<{ lore_entry: Record<string, unknown> }> {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.aiProxy.requestAgent(
      "POST",
      "/world-synth/lore",
      {
        title: body.title,
        category_hint: body.category_hint ?? "lore",
        context: body.context ?? null,
        custom_prompt: body.custom_prompt ?? "",
      },
      { timeoutMs: 45_000 },
    );
  }

  @Post(":id/synthesize-faction")
  async faction(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: SynthGranularBody,
  ): Promise<{ faction: Record<string, unknown> }> {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.aiProxy.requestAgent(
      "POST",
      "/world-synth/faction",
      {
        name: body.name,
        context: body.context ?? null,
        custom_prompt: body.custom_prompt ?? "",
      },
      { timeoutMs: 45_000 },
    );
  }

  /**
   * Completion + narrative scaffold pass.
   * Recebe context (snapshot do mundo em construção) e retorna additions + rationale.
   * Timeout 120s — gera N items + scaffold narrativo (story arc + clocks + quests).
   */
  @Post(":id/synthesize-complete")
  async complete(
    @Req() req: AuthRequest,
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: CompleteBody,
  ): Promise<{
    additions: Record<string, unknown>;
    rationale: string;
  }> {
    await this.campaignService.ensureDmOwnership(campaignId, getUserId(req));
    return this.aiProxy.requestAgent(
      "POST",
      "/world-synth/complete",
      {
        context: body.context,
      },
      { timeoutMs: 120_000 },
    );
  }
}
