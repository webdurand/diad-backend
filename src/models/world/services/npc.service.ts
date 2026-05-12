import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { CampaignEntity } from "src/entities/campaign.entity";
import { NpcEntity, type NpcProfileDepth } from "src/entities/npc.entity";
import { NpcArchetypeTemplateEntity } from "src/entities/npc-archetype-template.entity";
import { NpcRelationshipEntity } from "src/entities/npc-relationship.entity";
import {
  NpcStoryHookEntity,
  type NpcStoryHookRelatedEntityType,
  type NpcStoryHookType,
} from "src/entities/npc-story-hook.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { SessionNpcStateEntity } from "src/entities/session-npc-state.entity";
import { SceneEntity } from "src/entities/scene.entity";
import { SceneNpcEntity } from "src/entities/scene-npc.entity";
import { randomBytes } from "crypto";
import {
  NpcProjectionOptions,
  ProjectedNpc,
  projectNpc,
  projectNpcs,
} from "./npc-projection";
import { pickArchetypeFromDescriptor } from "./archetype-picker";
import { SessionNpcStateService } from "./session-npc-state.service";

export interface CreateNpcDto {
  name: string;
  title?: string;
  race?: string;
  description?: string;
  descriptionHidden?: string;
  monsterId?: string;
  archetypeSlug?: string;
  provenance?: "manual" | "auto-materialized" | "director-planned";
  personalityBig5?: Record<string, number>;
  motivation?: string;
  knowledgeScope?: string[];
  dialogueStyle?: string;
  voiceNotes?: string;
  tags?: string[];
  profileDepth?: NpcProfileDepth;
  homeLocationId?: string | null;
  homePoiId?: string | null;
  storyHooks?: CreateNpcStoryHookDto[];
  gameSessionId?: string;
  initialDisposition?: "friendly" | "neutral" | "hostile" | "indifferent";
}

export interface CreateCanonicalExpansionDto extends CreateNpcDto {
  expansionReason: string;
}

export interface CreateNpcStoryHookDto {
  hookType: NpcStoryHookType;
  title?: string;
  description?: string;
  relatedEntityType?: NpcStoryHookRelatedEntityType;
  relatedEntityId?: string;
  relatedEntityName?: string;
  isKnownToParty?: boolean;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface AddRelationshipDto {
  targetNpcId?: string;
  targetFactionId?: string;
  relationshipType: string;
  description?: string;
  strength?: number;
  isKnownToParty?: boolean;
}

/**
 * NPC com state de aventura mergeado (status, disposition, currentLocationId).
 * Retornado por listForSession / getForSession quando o caller precisa do estado
 * "como aparece nessa aventura" em vez da ficha canônica pura.
 */
export type NpcWithSessionState = NpcEntity & {
  status: "alive" | "dead" | "missing" | "unknown";
  disposition: "friendly" | "neutral" | "hostile" | "indifferent";
  currentLocationId?: string;
};

export interface CanonicalNpcRosterItem extends ProjectedNpc {
  profileDepth: NpcProfileDepth;
  homeLocationId?: string;
  homePoiId?: string;
  relationships: NpcRelationshipEntity[];
  storyHooks: NpcStoryHookEntity[];
}

@Injectable()
export class NpcService {
  private readonly logger = new Logger(NpcService.name);
  private archetypeCache = new Map<string, NpcArchetypeTemplateEntity>();

  constructor(
    @InjectRepository(NpcEntity)
    private readonly npcRepo: Repository<NpcEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(NpcRelationshipEntity)
    private readonly relationRepo: Repository<NpcRelationshipEntity>,
    @InjectRepository(NpcStoryHookEntity)
    private readonly storyHookRepo: Repository<NpcStoryHookEntity>,
    @InjectRepository(NpcArchetypeTemplateEntity)
    private readonly archetypeRepo: Repository<NpcArchetypeTemplateEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(SessionNpcStateEntity)
    private readonly stateRepo: Repository<SessionNpcStateEntity>,
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    @InjectRepository(SceneNpcEntity)
    private readonly sceneNpcRepo: Repository<SceneNpcEntity>,
    private readonly stateService: SessionNpcStateService,
  ) {}

  async resolveArchetype(slug: string): Promise<NpcArchetypeTemplateEntity> {
    const cached = this.archetypeCache.get(slug);
    if (cached) return cached;

    const template = await this.archetypeRepo.findOne({ where: { slug } });
    if (!template) {
      throw new BadRequestException(
        `Archetype slug desconhecido: '${slug}'. ` +
          `Slugs válidos vivem em npc_archetype_templates.`,
      );
    }
    this.archetypeCache.set(slug, template);
    return template;
  }

  /**
   * Cria NPC. Sem gameSessionId = canônico do mundo (setup via UI). Com
   * gameSessionId = scoped à aventura, auto-anexado à scene ativa e com state
   * inicializado. Caminho da narrativa (create_npc_from_narrative tool).
   */
  async create(campaignId: string, dto: CreateNpcDto): Promise<NpcEntity> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
      select: {
        id: true,
        npcRosterPolicy: true,
      },
    });
    if (!campaign) throw new NotFoundException("Campanha nao encontrada.");

    let monsterId = dto.monsterId;
    if (!monsterId && dto.archetypeSlug) {
      const template = await this.resolveArchetype(dto.archetypeSlug);
      monsterId = template.monsterId;
    }

    const slug = this.generateSlug(dto.name);
    const sessionScoped = !!dto.gameSessionId;
    if (
      sessionScoped &&
      campaign.npcRosterPolicy === "canonical_v1" &&
      !this.isAllowedEphemeralSessionNpc(dto, monsterId)
    ) {
      throw new BadRequestException({
        ok: false,
        code: "NPC_CANONICAL_REQUIRED",
        error:
          "Mundos canonical_v1 nao permitem criar pessoa nomeada so na sessao. Crie/expanda um NPC canonico antes da cena.",
      });
    }

    const npc = this.npcRepo.create({
      campaignId,
      gameSessionId: dto.gameSessionId,
      slug,
      name: dto.name,
      title: dto.title,
      race: dto.race,
      description: dto.description,
      descriptionHidden: dto.descriptionHidden,
      monsterId,
      provenance:
        dto.provenance ?? (sessionScoped ? "auto-materialized" : "manual"),
      personalityBig5: dto.personalityBig5 ?? {},
      motivation: dto.motivation,
      knowledgeScope: dto.knowledgeScope ?? [],
      dialogueStyle: dto.dialogueStyle,
      voiceNotes: dto.voiceNotes,
      profileDepth:
        dto.profileDepth ??
        (dto.provenance === "director-planned" ? "expanded" : "core"),
      homeLocationId: dto.homeLocationId ?? undefined,
      homePoiId: dto.homePoiId ?? undefined,
      tags: dto.tags ?? [],
    });
    const saved = await this.npcRepo.save(npc);

    if (!sessionScoped && dto.storyHooks?.length) {
      await this.createStoryHooks(campaignId, saved.id, dto.storyHooks);
    }

    if (sessionScoped) {
      await this.attachToSessionContext(
        saved,
        dto.gameSessionId!,
        dto.initialDisposition,
      );
    }

    return saved;
  }

  async expandCanonicalNpc(
    campaignId: string,
    dto: CreateCanonicalExpansionDto,
  ): Promise<NpcEntity> {
    if (!dto.expansionReason?.trim()) {
      throw new BadRequestException({
        ok: false,
        code: "NPC_EXPANSION_REASON_REQUIRED",
        error: "Expansao canonica precisa de expansionReason.",
      });
    }

    const raw = await this.campaignRepo.query(
      `UPDATE campaigns
         SET npc_expansion_budget_used = npc_expansion_budget_used + 1,
             updated_at = now()
       WHERE id = $1
         AND npc_roster_policy = 'canonical_v1'
         AND npc_expansion_budget_used < npc_expansion_budget_total
       RETURNING id`,
      [campaignId],
    );
    const rows = Array.isArray(raw) ? raw : [];
    if (rows.length === 0) {
      const campaign = await this.campaignRepo.findOne({
        where: { id: campaignId },
        select: {
          id: true,
          npcRosterPolicy: true,
          npcExpansionBudgetTotal: true,
          npcExpansionBudgetUsed: true,
        },
      });
      if (!campaign) throw new NotFoundException("Campanha nao encontrada.");
      if (campaign.npcRosterPolicy !== "canonical_v1") {
        throw new BadRequestException({
          ok: false,
          code: "NPC_EXPANSION_POLICY_DISABLED",
          error: "Expansao canonica so existe em mundos canonical_v1.",
        });
      }
      throw new BadRequestException({
        ok: false,
        code: "NPC_EXPANSION_BUDGET_EXHAUSTED",
        error: "Orcamento de expansao de NPCs canonicos esgotado.",
        current: campaign.npcExpansionBudgetUsed,
        max: campaign.npcExpansionBudgetTotal,
      });
    }

    try {
      return await this.create(campaignId, {
        ...dto,
        gameSessionId: undefined,
        provenance: "director-planned",
        profileDepth: dto.profileDepth ?? "expanded",
        storyHooks: [
          ...(dto.storyHooks ?? []),
          {
            hookType: "clue_holder",
            title: "Motivo da expansao",
            description: dto.expansionReason,
            priority: 6,
            metadata: { expansionReason: dto.expansionReason },
          },
        ],
      });
    } catch (err) {
      await this.campaignRepo.query(
        `UPDATE campaigns
            SET npc_expansion_budget_used = GREATEST(npc_expansion_budget_used - 1, 0)
          WHERE id = $1`,
        [campaignId],
      );
      throw err;
    }
  }

  async createStoryHook(
    campaignId: string,
    npcId: string,
    dto: CreateNpcStoryHookDto,
  ): Promise<NpcStoryHookEntity> {
    return (
      await this.createStoryHooks(campaignId, npcId, [dto])
    )[0];
  }

  async createStoryHooks(
    campaignId: string,
    npcId: string,
    hooks: CreateNpcStoryHookDto[],
  ): Promise<NpcStoryHookEntity[]> {
    const npc = await this.npcRepo.findOne({
      where: { id: npcId, campaignId },
      select: { id: true },
    });
    if (!npc) throw new NotFoundException("NPC nao encontrado.");

    const entities = hooks
      .filter((h) => h?.hookType)
      .map((h) =>
        this.storyHookRepo.create({
          campaignId,
          npcId,
          hookType: h.hookType,
          title: h.title,
          description: h.description,
          relatedEntityType: h.relatedEntityType,
          relatedEntityId: h.relatedEntityId,
          relatedEntityName: h.relatedEntityName,
          isKnownToParty: h.isKnownToParty ?? false,
          priority: h.priority ?? 5,
          metadata: h.metadata ?? {},
        }),
      );
    if (entities.length === 0) return [];
    return this.storyHookRepo.save(entities);
  }

  async listStoryHooksByCampaign(
    campaignId: string,
  ): Promise<NpcStoryHookEntity[]> {
    return this.storyHookRepo.find({
      where: { campaignId },
      order: { priority: "DESC", createdAt: "ASC" },
    });
  }

  async listCanonicalRoster(
    campaignId: string,
    options: NpcProjectionOptions = {},
  ): Promise<CanonicalNpcRosterItem[]> {
    const [npcs, relationships, hooks] = await Promise.all([
      this.listCanonical(campaignId),
      this.relationRepo
        .createQueryBuilder("r")
        .innerJoin("npcs", "src", "src.id = r.source_npc_id")
        .leftJoinAndSelect("r.targetNpc", "targetNpc")
        .leftJoinAndSelect("r.targetFaction", "targetFaction")
        .where("src.campaign_id = :campaignId", { campaignId })
        .getMany(),
      this.listStoryHooksByCampaign(campaignId),
    ]);
    const relsByNpc = new Map<string, NpcRelationshipEntity[]>();
    for (const rel of relationships) {
      if (!options.dmOmniscient && !rel.isKnownToParty) continue;
      const current = relsByNpc.get(rel.sourceNpcId) ?? [];
      current.push(rel);
      relsByNpc.set(rel.sourceNpcId, current);
    }
    const hooksByNpc = new Map<string, NpcStoryHookEntity[]>();
    for (const hook of hooks) {
      const current = hooksByNpc.get(hook.npcId) ?? [];
      current.push(hook);
      hooksByNpc.set(hook.npcId, current);
    }
    return npcs.map((npc) => ({
      ...projectNpc(npc, options),
      profileDepth: npc.profileDepth,
      homeLocationId: npc.homeLocationId,
      homePoiId: npc.homePoiId,
      relationships: relsByNpc.get(npc.id) ?? [],
      storyHooks: (hooksByNpc.get(npc.id) ?? []).filter(
        (hook) => options.dmOmniscient || hook.isKnownToParty,
      ),
    }));
  }

  /**
   * NPC criado pelo narrador precisa virar tangível na cena ativa: state
   * inicial + scene_npcs. Sem isso, o agent diz "5 homens chegam" mas o
   * combate não acha hostis (`npcsPresent` empty) e o fallback heurístico
   * inventa stub genérica do label do botão.
   */
  private async attachToSessionContext(
    npc: NpcEntity,
    gameSessionId: string,
    disposition?: "friendly" | "neutral" | "hostile" | "indifferent",
  ): Promise<void> {
    try {
      await this.stateService.getOrCreate(gameSessionId, npc.id, {
        disposition: disposition ?? "neutral",
      });
    } catch (err) {
      this.logger.warn(
        `npc state init falhou npc=${npc.id} session=${gameSessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    try {
      const activeScene = await this.sceneRepo.findOne({
        where: { sessionId: gameSessionId, isActive: true },
      });
      if (!activeScene) return;
      const existing = await this.sceneNpcRepo.findOne({
        where: { sceneId: activeScene.id, npcId: npc.id },
      });
      if (existing) return;
      const sceneNpc = this.sceneNpcRepo.create({
        sceneId: activeScene.id,
        npcId: npc.id,
      });
      await this.sceneNpcRepo.save(sceneNpc);
      if (activeScene.locationId) {
        await this.stateService.upsert(gameSessionId, npc.id, {
          currentLocationId: activeScene.locationId,
        });
      }
    } catch (err) {
      this.logger.warn(
        `scene_npcs attach falhou npc=${npc.id} session=${gameSessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async getById(npcId: string): Promise<NpcEntity> {
    const npc = await this.npcRepo.findOne({
      where: { id: npcId },
      relations: ["monster"],
    });
    if (!npc) throw new NotFoundException("NPC nao encontrado.");
    return npc;
  }

  async getProjectedById(
    npcId: string,
    options: NpcProjectionOptions = {},
  ): Promise<ProjectedNpc> {
    const npc = await this.getById(npcId);
    return projectNpc(npc, options);
  }

  /** Lista NPCs canônicos da campanha (sem state de sessão). */
  async listCanonical(campaignId: string): Promise<NpcEntity[]> {
    return this.npcRepo.find({
      where: { campaignId, gameSessionId: IsNull() },
      order: { name: "ASC" },
    });
  }

  async listCanonicalProjected(
    campaignId: string,
    options: NpcProjectionOptions = {},
  ): Promise<ProjectedNpc[]> {
    const npcs = await this.listCanonical(campaignId);
    return projectNpcs(npcs, options);
  }

  /**
   * Lista NPCs visíveis nessa aventura: canônicos do mundo + auto-materializados
   * da própria sessão. Cada um vem com state mergeado da `session_npc_state`
   * (status/disposition/currentLocationId), criando defaults se ainda não existir.
   */
  async listForSession(gameSessionId: string): Promise<NpcWithSessionState[]> {
    const session = await this.sessionRepo.findOne({
      where: { id: gameSessionId },
      select: { id: true, campaignId: true },
    });
    if (!session) {
      throw new NotFoundException("GameSession não encontrada.");
    }

    const npcs = await this.npcRepo.find({
      where: [
        ...(session.campaignId
          ? [{ campaignId: session.campaignId, gameSessionId: IsNull() }]
          : []),
        { gameSessionId },
      ],
      order: { name: "ASC" },
    });

    if (npcs.length === 0) return [];

    const states = await this.stateRepo.find({
      where: { gameSessionId, npcId: In(npcs.map((n) => n.id)) },
    });
    const byNpc = new Map(states.map((s) => [s.npcId, s]));

    return npcs.map((npc) => this.mergeState(npc, byNpc.get(npc.id)));
  }

  async listForSessionProjected(
    gameSessionId: string,
    options: NpcProjectionOptions = {},
  ): Promise<
    (ProjectedNpc & {
      status: string;
      disposition: string;
      currentLocationId?: string;
    })[]
  > {
    const merged = await this.listForSession(gameSessionId);
    return merged.map((m) => ({
      ...projectNpc(m, options),
      status: m.status,
      disposition: m.disposition,
      currentLocationId: m.currentLocationId,
    }));
  }

  /**
   * Match canônico por nome dentro da campanha (excluí auto-materializados).
   * Case-insensitive exato; sem fuzzy. Multiple match retorna `null`.
   */
  async findByNameInCampaign(
    campaignId: string,
    name: string,
  ): Promise<NpcEntity | null> {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    const matches = await this.npcRepo
      .createQueryBuilder("npc")
      .where("npc.campaign_id = :campaignId", { campaignId })
      .andWhere("npc.game_session_id IS NULL")
      .andWhere("LOWER(npc.name) = LOWER(:name)", { name: trimmed })
      .limit(2)
      .getMany();
    return matches.length === 1 ? matches[0] : null;
  }

  /**
   * Match por nome dentro da aventura: canônicos do mundo + auto-materializados
   * dessa sessão. Idempotência do materialize usa esta lookup.
   */
  async findByNameInSession(
    gameSessionId: string,
    name: string,
  ): Promise<NpcEntity | null> {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    const session = await this.sessionRepo.findOne({
      where: { id: gameSessionId },
      select: { id: true, campaignId: true },
    });
    if (!session) return null;

    const qb = this.npcRepo
      .createQueryBuilder("npc")
      .where("LOWER(npc.name) = LOWER(:name)", { name: trimmed })
      .andWhere(
        session.campaignId
          ? "(npc.game_session_id = :gameSessionId OR (npc.game_session_id IS NULL AND npc.campaign_id = :campaignId))"
          : "npc.game_session_id = :gameSessionId",
        { gameSessionId, campaignId: session.campaignId },
      )
      .limit(2);

    const matches = await qb.getMany();
    return matches.length === 1 ? matches[0] : null;
  }

  async update(npcId: string, dto: Partial<CreateNpcDto>): Promise<NpcEntity> {
    const npc = await this.getById(npcId);
    Object.assign(npc, dto);
    return this.npcRepo.save(npc);
  }

  /**
   * Materializa NPC stub a partir de nome livre, scoped à aventura. Idempotente:
   * retorna o NPC existente (canônico ou auto da mesma sessão) se já houver
   * match por nome. Auto-materializados criados aqui têm gameSessionId setado e
   * são deletados em cascade quando a sessão é deletada.
   */
  async materializeStubFromName(
    gameSessionId: string,
    name: string,
    descriptor?: string,
    disposition: "friendly" | "neutral" | "hostile" | "indifferent" = "neutral",
  ): Promise<NpcEntity> {
    const existing = await this.findByNameInSession(gameSessionId, name);
    if (existing) {
      await this.attachToSessionContext(existing, gameSessionId, disposition);
      return existing;
    }

    const session = await this.sessionRepo.findOne({
      where: { id: gameSessionId },
      select: { id: true, campaignId: true },
    });
    if (!session?.campaignId) {
      throw new BadRequestException(
        "Não é possível materializar NPC: sessão sem campaignId.",
      );
    }
    const campaign = await this.campaignRepo.findOne({
      where: { id: session.campaignId },
      select: { id: true, npcRosterPolicy: true },
    });
    if (campaign?.npcRosterPolicy === "canonical_v1") {
      throw new BadRequestException({
        ok: false,
        code: "NPC_CANONICAL_REQUIRED",
        error:
          "Mundos canonical_v1 nao materializam pessoa nomeada da prosa. Use NPC canonico ou encontro anonimo/monstro.",
      });
    }

    const archetypeSlug = pickArchetypeFromDescriptor(descriptor || name);
    let monsterId: string | undefined;
    if (archetypeSlug) {
      const template = await this.resolveArchetype(archetypeSlug);
      monsterId = template.monsterId;
    }

    const slug = this.generateSlug(name);
    const npc = this.npcRepo.create({
      campaignId: session.campaignId,
      gameSessionId,
      slug,
      name: name.trim(),
      description: descriptor ?? `${name} mencionado pelo narrador.`,
      monsterId,
      provenance: "auto-materialized",
      personalityBig5: {},
      knowledgeScope: [],
      tags: [],
    });
    const saved = await this.npcRepo.save(npc);
    await this.attachToSessionContext(saved, gameSessionId, disposition);
    return saved;
  }

  async remove(npcId: string): Promise<void> {
    await this.npcRepo.delete(npcId);
  }

  /**
   * Move NPC pra location dentro da aventura. Atualiza session_npc_state,
   * não a tabela canônica.
   */
  async moveNpc(
    gameSessionId: string,
    npcId: string,
    locationId: string | null,
  ): Promise<SessionNpcStateEntity> {
    return this.stateService.upsert(gameSessionId, npcId, {
      currentLocationId: locationId,
    });
  }

  async getNpcsAtLocation(
    gameSessionId: string,
    locationId: string,
  ): Promise<NpcEntity[]> {
    const states = await this.stateService.listByLocation(
      gameSessionId,
      locationId,
    );
    if (states.length === 0) return [];
    return this.npcRepo.find({
      where: { id: In(states.map((s) => s.npcId)) },
      order: { name: "ASC" },
    });
  }

  async addRelationship(
    sourceNpcId: string,
    dto: AddRelationshipDto,
  ): Promise<NpcRelationshipEntity> {
    const rel = this.relationRepo.create({
      sourceNpcId,
      targetNpcId: dto.targetNpcId,
      targetFactionId: dto.targetFactionId,
      relationshipType: dto.relationshipType,
      description: dto.description,
      strength: dto.strength ?? 5,
      isKnownToParty: dto.isKnownToParty ?? false,
    });
    return this.relationRepo.save(rel);
  }

  async getRelationships(npcId: string): Promise<NpcRelationshipEntity[]> {
    return this.relationRepo.find({
      where: [{ sourceNpcId: npcId }, { targetNpcId: npcId }],
      relations: ["sourceNpc", "targetNpc", "targetFaction"],
    });
  }

  async removeRelationship(relationshipId: string): Promise<void> {
    await this.relationRepo.delete(relationshipId);
  }

  private mergeState(
    npc: NpcEntity,
    state: SessionNpcStateEntity | undefined,
  ): NpcWithSessionState {
    return Object.assign({}, npc, {
      status: state?.status ?? "alive",
      disposition: state?.disposition ?? "neutral",
      currentLocationId: state?.currentLocationId ?? npc.homeLocationId,
    }) as NpcWithSessionState;
  }

  private isAllowedEphemeralSessionNpc(
    dto: CreateNpcDto,
    monsterId?: string,
  ): boolean {
    const tags = new Set((dto.tags ?? []).map((t) => t.toLowerCase()));
    if (tags.has("random-encounter")) return true;
    if (tags.has("encounter-ephemeral")) return true;
    if (tags.has("anonymous-mob")) return true;
    if (!monsterId) return false;
    const words = (dto.name || "").trim().split(/\s+/).filter(Boolean);
    const looksLikeProperPersonName =
      words.length >= 2 &&
      words.every((w) => /^[A-ZÁÂÃÀÉÊÍÓÔÕÚÇ][\p{L}'-]+$/u.test(w));
    return !looksLikeProperPersonName;
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const suffix = randomBytes(3).toString("hex");
    return `${base}-${suffix}`;
  }
}
