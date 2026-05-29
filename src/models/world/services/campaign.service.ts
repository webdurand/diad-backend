import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CampaignEntity,
  CampaignContentBudget,
  CampaignContentCounts,
  CampaignDmPersonality,
  CampaignTonalAnchor,
  type NpcRosterPolicy,
} from "src/entities/campaign.entity";
import { CampaignPlayerEntity } from "src/entities/campaign-player.entity";
import { randomBytes } from "crypto";
import { PhaseService } from "./phase.service";

export type BoundedCountKind = "scenes" | "npcs" | "locations";

export interface CreateCampaignDto {
  name: string;
  description?: string;
  setting?: string;
  theme?: string;
  difficulty?: string;
  worldLore?: string;
  dmMode?: "ai" | "human";
  scope?: "solo" | "party";
  isDraft?: boolean;
  generationSeed?: Record<string, unknown>;
  storyFirstEnabled?: boolean;
  npcRosterPolicy?: NpcRosterPolicy;
}

export interface UpdateCampaignDto {
  name?: string;
  description?: string;
  setting?: string;
  theme?: string;
  difficulty?: string;
  status?: "draft" | "active" | "paused" | "completed" | "archived";
  worldLore?: string;
  isDraft?: boolean;
  generationSeed?: Record<string, unknown>;
  startingLocationId?: string | null;
  npcRosterPolicy?: NpcRosterPolicy;
}

export interface ListSoloWorldsQuery {
  q?: string;
  page?: number;
  pageSize?: number;
  isDraft?: boolean;
}

export interface SoloWorldListItem {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  setting: string | null;
  difficulty: string | null;
  status: string;
  dmMode: "ai" | "human";
  scope: "solo" | "party";
  isDraft: boolean;
  tonalAnchor: CampaignTonalAnchor | null;
  worldLore: string | null;
  updatedAt: Date;
  createdAt: Date;
  counts: {
    npcs: number;
    locations: number;
    factions: number;
    loreEntries: number;
    quests: number;
  };
}

export interface ListSoloWorldsResult {
  items: SoloWorldListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InitializeBudgetDto {
  contentBudget?: Partial<CampaignContentBudget>;
  dmPersonality?: CampaignDmPersonality;
  tonalAnchor?: CampaignTonalAnchor;
  centralQuestion?: string;
}

export interface UpdateBudgetDto {
  contentBudget?: Partial<CampaignContentBudget>;
  dmPersonality?: CampaignDmPersonality;
  tonalAnchor?: CampaignTonalAnchor;
  centralQuestion?: string;
  questionStatedAtScene?: number;
  questionAnswered?: boolean;
  questionAnswer?: string;
}

@Injectable()
export class CampaignService {
  constructor(
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(CampaignPlayerEntity)
    private readonly playerRepo: Repository<CampaignPlayerEntity>,
  ) {}

  async create(
    dmUserId: string,
    dto: CreateCampaignDto,
  ): Promise<CampaignEntity> {
    const slug = this.generateSlug(dto.name);
    const inviteCode = randomBytes(6).toString("hex");

    const campaign = this.campaignRepo.create({
      slug,
      name: dto.name,
      description: dto.description,
      setting: dto.setting,
      theme: dto.theme,
      difficulty: dto.difficulty ?? "standard",
      worldLore: dto.worldLore,
      dmUserId,
      status: "draft",
      inviteCode,
      dmMode: dto.dmMode ?? "ai",
      scope: dto.scope ?? "solo",
      isDraft: dto.isDraft ?? false,
      generationSeed: this.buildGenerationSeed(dto),
      npcRosterPolicy:
        dto.npcRosterPolicy ??
        (dto.dmMode !== "human" && (dto.scope ?? "solo") === "solo"
          ? "canonical_v1"
          : "legacy"),
      npcExpansionBudgetTotal: 10,
      npcExpansionBudgetUsed: 0,
      contentBudget:
        dto.dmMode !== "human" && (dto.scope ?? "solo") === "solo"
          ? { maxScenes: 12, maxNpcs: 45, maxLocations: 6 }
          : undefined,
    });

    const saved = await this.campaignRepo.save(campaign);


    const dmPlayer = this.playerRepo.create({
      campaignId: saved.id,
      userId: dmUserId,
      isActive: true,
    });
    await this.playerRepo.save(dmPlayer);

    return saved;
  }

  private buildGenerationSeed(
    dto: CreateCampaignDto,
  ): Record<string, unknown> | undefined {
    const seed = { ...(dto.generationSeed ?? {}) };
    if (dto.storyFirstEnabled !== undefined) {
      seed.storyFirstEnabled = dto.storyFirstEnabled;
    }
    if (dto.storyFirstEnabled === true && !seed.storySeed) {
      seed.storySeed = PhaseService.buildDefaultStorySeed({
        name: dto.name,
        description: dto.description,
        setting: dto.setting,
        theme: dto.theme,
      });
    }
    return Object.keys(seed).length > 0 ? seed : undefined;
  }

  async listByUser(userId: string): Promise<CampaignEntity[]> {
    const players = await this.playerRepo.find({
      where: { userId, isActive: true },
      relations: ["campaign"],
    });
    return players
      .map((p) => p.campaign)
      .filter((c): c is CampaignEntity => Boolean(c) && !c.isSandbox);
  }

  async listSoloWorlds(
    userId: string,
    query: ListSoloWorldsQuery = {},
  ): Promise<ListSoloWorldsResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 12));
    const offset = (page - 1) * pageSize;

    const qb = this.campaignRepo
      .createQueryBuilder("c")
      .where("c.dm_user_id = :userId", { userId })
      .andWhere("c.dm_mode = 'ai'")
      .andWhere("c.scope = 'solo'");

    if (typeof query.isDraft === "boolean") {
      qb.andWhere("c.is_draft = :isDraft", { isDraft: query.isDraft });
    } else {
      qb.andWhere("c.is_draft = false");
    }

    if (query.q && query.q.trim().length > 0) {
      qb.andWhere("c.name ILIKE :q", { q: `%${query.q.trim()}%` });
    }

    const [campaigns, total] = await qb
      .orderBy("c.updated_at", "DESC")
      .skip(offset)
      .take(pageSize)
      .getManyAndCount();

    const items: SoloWorldListItem[] = await Promise.all(
      campaigns.map(async (c) => {
        const counts = await this.fetchCountsForCampaign(c.id);
        return {
          id: c.id,
          slug: c.slug ?? null,
          name: c.name,
          description: c.description ?? null,
          setting: c.setting ?? null,
          difficulty: c.difficulty ?? null,
          status: c.status,
          dmMode: c.dmMode,
          scope: c.scope,
          isDraft: c.isDraft,
          tonalAnchor: c.tonalAnchor ?? null,
          worldLore: c.worldLore ?? null,
          updatedAt: c.updatedAt,
          createdAt: c.createdAt,
          counts,
        };
      }),
    );

    return { items, total, page, pageSize };
  }

  private async fetchCountsForCampaign(
    campaignId: string,
  ): Promise<SoloWorldListItem["counts"]> {
    const result = await this.campaignRepo.query(
      `SELECT
         (SELECT COUNT(*) FROM npcs WHERE campaign_id = $1 AND game_session_id IS NULL) AS npcs,
         (SELECT COUNT(*) FROM locations WHERE campaign_id = $1) AS locations,
         (SELECT COUNT(*) FROM factions WHERE campaign_id = $1) AS factions,
         (SELECT COUNT(*) FROM lore_entries WHERE campaign_id = $1) AS lore,
         (SELECT COUNT(*) FROM quests q
            JOIN game_sessions s ON s.id = q.game_session_id
            WHERE s.campaign_id = $1) AS quests`,
      [campaignId],
    );
    const row = result[0] ?? {
      npcs: "0",
      locations: "0",
      factions: "0",
      lore: "0",
      quests: "0",
    };
    return {
      npcs: parseInt(row.npcs, 10) || 0,
      locations: parseInt(row.locations, 10) || 0,
      factions: parseInt(row.factions, 10) || 0,
      loreEntries: parseInt(row.lore, 10) || 0,
      quests: parseInt(row.quests, 10) || 0,
    };
  }

  async publishWorld(campaignId: string): Promise<CampaignEntity> {
    const campaign = await this.getById(campaignId);
    campaign.isDraft = false;
    return this.campaignRepo.save(campaign);
  }

  async setGenerationSeed(
    campaignId: string,
    seed: Record<string, unknown>,
  ): Promise<CampaignEntity> {
    const campaign = await this.getById(campaignId);
    campaign.generationSeed = seed;
    return this.campaignRepo.save(campaign);
  }

  async setQuestsTemplate(
    campaignId: string,
    quests: unknown[],
  ): Promise<{ questsTemplate: unknown[] }> {
    const campaign = await this.getById(campaignId);
    const seed = campaign.generationSeed ?? {};
    seed.questsTemplate = quests;
    campaign.generationSeed = seed;
    await this.campaignRepo.save(campaign);
    return { questsTemplate: quests };
  }

  async getQuestsTemplate(
    campaignId: string,
  ): Promise<{ questsTemplate: unknown[] }> {
    const campaign = await this.getById(campaignId);
    const seed = campaign.generationSeed ?? {};
    const tpl = seed.questsTemplate;
    return { questsTemplate: Array.isArray(tpl) ? tpl : [] };
  }

  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  async resolveId(slugOrId: string): Promise<string> {
    const candidate = (slugOrId || "").trim();
    if (!candidate) {
      throw new NotFoundException("Campanha nao encontrada.");
    }
    if (CampaignService.UUID_REGEX.test(candidate)) {

      const exists = await this.campaignRepo.findOne({
        where: { id: candidate },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException("Campanha nao encontrada.");
      return exists.id;
    }
    const bySlug = await this.campaignRepo.findOne({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!bySlug) throw new NotFoundException("Campanha nao encontrada.");
    return bySlug.id;
  }

  async getById(campaignId: string): Promise<CampaignEntity> {
    const candidate = (campaignId || "").trim();
    const where = CampaignService.UUID_REGEX.test(candidate)
      ? { id: candidate }
      : { slug: candidate };
    const campaign = await this.campaignRepo.findOne({ where });
    if (!campaign) throw new NotFoundException("Campanha nao encontrada.");
    return campaign;
  }

  async getByInviteCode(code: string): Promise<CampaignEntity> {
    const campaign = await this.campaignRepo.findOne({
      where: { inviteCode: code },
    });
    if (!campaign) throw new NotFoundException("Convite invalido.");
    return campaign;
  }

  async update(
    campaignId: string,
    dto: UpdateCampaignDto,
  ): Promise<CampaignEntity> {
    const campaign = await this.getById(campaignId);
    Object.assign(campaign, dto);
    return this.campaignRepo.save(campaign);
  }

  async delete(campaignId: string): Promise<void> {
    const campaign = await this.getById(campaignId);
    await this.campaignRepo.delete(campaign.id);
  }

  async addPlayer(
    campaignId: string,
    userId: string,
    characterId?: string,
  ): Promise<CampaignPlayerEntity> {
    const existing = await this.playerRepo.findOne({
      where: { campaignId, userId },
    });
    if (existing) {
      existing.isActive = true;
      if (characterId) existing.characterId = characterId;
      return this.playerRepo.save(existing);
    }

    const player = this.playerRepo.create({
      campaignId,
      userId,
      characterId,
      isActive: true,
    });
    return this.playerRepo.save(player);
  }

  async setPlayerCharacter(
    campaignId: string,
    userId: string,
    characterId: string,
  ): Promise<CampaignPlayerEntity> {
    const player = await this.playerRepo.findOne({
      where: { campaignId, userId },
    });
    if (!player)
      throw new NotFoundException("Jogador nao encontrado na campanha.");
    player.characterId = characterId;
    return this.playerRepo.save(player);
  }

  async removePlayer(campaignId: string, userId: string): Promise<void> {
    await this.playerRepo.update({ campaignId, userId }, { isActive: false });
  }

  async getPlayers(campaignId: string): Promise<CampaignPlayerEntity[]> {
    return this.playerRepo.find({
      where: { campaignId, isActive: true },
      relations: ["user", "character"],
    });
  }

  async ensureDmOwnership(
    campaignId: string,
    userId: string,
  ): Promise<CampaignEntity> {
    const campaign = await this.getById(campaignId);
    if (campaign.dmUserId !== userId) {
      throw new NotFoundException("Campanha nao encontrada.");
    }
    return campaign;
  }

  async ensureMembership(
    campaignId: string,
    userId: string,
  ): Promise<CampaignPlayerEntity> {
    const player = await this.playerRepo.findOne({
      where: { campaignId, userId, isActive: true },
    });
    if (!player)
      throw new NotFoundException("Voce nao faz parte desta campanha.");
    return player;
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const suffix = randomBytes(3).toString("hex");
    return `${base}-${suffix}`;
  }

  async initializeWithBudget(
    campaignId: string,
    dto: InitializeBudgetDto,
  ): Promise<CampaignEntity> {
    const campaign = await this.getById(campaignId);
    if (dto.contentBudget) {
      campaign.contentBudget = {
        maxScenes:
          dto.contentBudget.maxScenes ?? campaign.contentBudget.maxScenes,
        maxNpcs: dto.contentBudget.maxNpcs ?? campaign.contentBudget.maxNpcs,
        maxLocations:
          dto.contentBudget.maxLocations ?? campaign.contentBudget.maxLocations,
      };
    }
    if (dto.dmPersonality) campaign.dmPersonality = dto.dmPersonality;
    if (dto.tonalAnchor) campaign.tonalAnchor = dto.tonalAnchor;
    if (dto.centralQuestion) {
      campaign.centralQuestion = dto.centralQuestion;
      if (!campaign.questionStatedAtScene) campaign.questionStatedAtScene = 1;
    }
    return this.campaignRepo.save(campaign);
  }

  async updateBudget(
    campaignId: string,
    dto: UpdateBudgetDto,
  ): Promise<CampaignEntity> {
    const campaign = await this.getById(campaignId);
    if (dto.contentBudget) {
      campaign.contentBudget = {
        maxScenes:
          dto.contentBudget.maxScenes ?? campaign.contentBudget.maxScenes,
        maxNpcs: dto.contentBudget.maxNpcs ?? campaign.contentBudget.maxNpcs,
        maxLocations:
          dto.contentBudget.maxLocations ?? campaign.contentBudget.maxLocations,
      };
    }
    if (dto.dmPersonality) campaign.dmPersonality = dto.dmPersonality;
    if (dto.tonalAnchor) campaign.tonalAnchor = dto.tonalAnchor;
    if (dto.centralQuestion !== undefined) {
      campaign.centralQuestion = dto.centralQuestion;
    }
    if (typeof dto.questionStatedAtScene === "number") {
      campaign.questionStatedAtScene = dto.questionStatedAtScene;
    }
    if (typeof dto.questionAnswered === "boolean") {
      campaign.questionAnswered = dto.questionAnswered;
    }
    if (dto.questionAnswer !== undefined) {
      campaign.questionAnswer = dto.questionAnswer;
    }
    return this.campaignRepo.save(campaign);
  }

  async incrementCount(
    campaignId: string,
    kind: BoundedCountKind,
  ): Promise<CampaignContentCounts> {
    const key = kind;
    const maxKey =
      kind === "scenes"
        ? "maxScenes"
        : kind === "npcs"
          ? "maxNpcs"
          : "maxLocations";

    const raw = await this.campaignRepo.query(
      `UPDATE campaigns
         SET current_counts = jsonb_set(
               current_counts,
               ARRAY[$2],
               to_jsonb((COALESCE((current_counts->>$2)::int, 0) + 1))
             ),
             updated_at = now()
       WHERE id = $1
         AND COALESCE((current_counts->>$2)::int, 0)
             < COALESCE((content_budget->>$3)::int, 0)
       RETURNING current_counts`,
      [campaignId, key, maxKey],
    );

    const rows = this.normalizeQueryRows(raw);

    if (rows.length === 0) {
      const campaign = await this.getById(campaignId);
      throw new ConflictException({
        ok: false,
        error: `Orçamento da campanha para ${kind} foi atingido.`,
        code: "BUDGET_EXCEEDED",
        kind,
        current: campaign.currentCounts[kind],
        max: campaign.contentBudget[maxKey],
      });
    }

    return rows[0].current_counts as CampaignContentCounts;
  }

  async getBudget(campaignId: string): Promise<{
    contentBudget: CampaignContentBudget;
    currentCounts: CampaignContentCounts;
  }> {
    const campaign = await this.getById(campaignId);
    return {
      contentBudget: campaign.contentBudget,
      currentCounts: campaign.currentCounts,
    };
  }

  private normalizeQueryRows(raw: unknown): Array<Record<string, any>> {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      if (raw.length === 0) return [];
      const first = raw[0];
      if (first && typeof first === "object" && !Array.isArray(first)) {
        return raw as Array<Record<string, any>>;
      }
      if (Array.isArray(first)) return first as Array<Record<string, any>>;
      return [];
    }
    if (typeof raw === "object" && raw !== null && "rows" in (raw as any)) {
      return ((raw as any).rows ?? []) as Array<Record<string, any>>;
    }
    return [];
  }
}
