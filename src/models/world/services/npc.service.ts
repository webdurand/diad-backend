import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { NpcEntity } from "src/entities/npc.entity";
import { NpcArchetypeTemplateEntity } from "src/entities/npc-archetype-template.entity";
import { NpcRelationshipEntity } from "src/entities/npc-relationship.entity";
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
  gameSessionId?: string;
  initialDisposition?: "friendly" | "neutral" | "hostile" | "indifferent";
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

@Injectable()
export class NpcService {
  private readonly logger = new Logger(NpcService.name);
  private archetypeCache = new Map<string, NpcArchetypeTemplateEntity>();

  constructor(
    @InjectRepository(NpcEntity)
    private readonly npcRepo: Repository<NpcEntity>,
    @InjectRepository(NpcRelationshipEntity)
    private readonly relationRepo: Repository<NpcRelationshipEntity>,
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
    let monsterId = dto.monsterId;
    if (!monsterId && dto.archetypeSlug) {
      const template = await this.resolveArchetype(dto.archetypeSlug);
      monsterId = template.monsterId;
    }

    const slug = this.generateSlug(dto.name);
    const sessionScoped = !!dto.gameSessionId;
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
      provenance: dto.provenance ?? (sessionScoped ? "auto-materialized" : "manual"),
      personalityBig5: dto.personalityBig5 ?? {},
      motivation: dto.motivation,
      knowledgeScope: dto.knowledgeScope ?? [],
      dialogueStyle: dto.dialogueStyle,
      voiceNotes: dto.voiceNotes,
      tags: dto.tags ?? [],
    });
    const saved = await this.npcRepo.save(npc);

    if (sessionScoped) {
      await this.attachToSessionContext(
        saved,
        dto.gameSessionId!,
        dto.initialDisposition,
      );
    }

    return saved;
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
  ): Promise<(ProjectedNpc & { status: string; disposition: string; currentLocationId?: string })[]> {
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
      currentLocationId: state?.currentLocationId,
    }) as NpcWithSessionState;
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
