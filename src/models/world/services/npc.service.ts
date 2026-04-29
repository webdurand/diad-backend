import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NpcEntity } from "src/entities/npc.entity";
import { NpcArchetypeTemplateEntity } from "src/entities/npc-archetype-template.entity";
import { NpcRelationshipEntity } from "src/entities/npc-relationship.entity";
import { randomBytes } from "crypto";
import {
  NpcProjectionOptions,
  ProjectedNpc,
  projectNpc,
  projectNpcs,
} from "./npc-projection";

export interface CreateNpcDto {
  name: string;
  title?: string;
  race?: string;
  description?: string;
  descriptionHidden?: string;
  disposition?: "friendly" | "neutral" | "hostile" | "indifferent";
  currentLocationId?: string;
  monsterId?: string;
  /**
   * Spec 026 Pillar 6 — slug de archetype RAW (`thug`, `bandit_captain`, ...).
   * Quando fornecido (e `monsterId` ausente), service resolve via
   * `npc_archetype_templates` e popula `monsterId` automaticamente.
   */
  archetypeSlug?: string;
  /**
   * Origem do NPC. Default `manual` (criado pelo DM via UI). Agents devem
   * passar `auto-materialized` quando criam via PreFlightOracle.
   */
  provenance?: "manual" | "auto-materialized" | "director-planned";
  personalityBig5?: Record<string, number>;
  motivation?: string;
  knowledgeScope?: string[];
  dialogueStyle?: string;
  voiceNotes?: string;
  tags?: string[];
}

export interface AddRelationshipDto {
  targetNpcId?: string;
  targetFactionId?: string;
  relationshipType: string;
  description?: string;
  strength?: number;
  isKnownToParty?: boolean;
}

@Injectable()
export class NpcService {
  /** Cache em memória do registry — cresce até 14 entries; sem invalidation
   * porque seed roda em migration, não muda em runtime. */
  private archetypeCache = new Map<string, NpcArchetypeTemplateEntity>();

  constructor(
    @InjectRepository(NpcEntity)
    private readonly npcRepo: Repository<NpcEntity>,
    @InjectRepository(NpcRelationshipEntity)
    private readonly relationRepo: Repository<NpcRelationshipEntity>,
    @InjectRepository(NpcArchetypeTemplateEntity)
    private readonly archetypeRepo: Repository<NpcArchetypeTemplateEntity>,
  ) {}

  /**
   * Spec 026 Pillar 6 — resolve slug de archetype para template completo.
   * Throws BadRequestException se slug inválido (handlers convertem em 400).
   */
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

  async create(campaignId: string, dto: CreateNpcDto): Promise<NpcEntity> {
    // Spec 026 Pillar 6: archetypeSlug resolve pra monsterId quando ausente.
    let monsterId = dto.monsterId;
    if (!monsterId && dto.archetypeSlug) {
      const template = await this.resolveArchetype(dto.archetypeSlug);
      monsterId = template.monsterId;
    }

    const slug = this.generateSlug(dto.name);
    const npc = this.npcRepo.create({
      campaignId,
      slug,
      name: dto.name,
      title: dto.title,
      race: dto.race,
      description: dto.description,
      descriptionHidden: dto.descriptionHidden,
      disposition: dto.disposition ?? "neutral",
      currentLocationId: dto.currentLocationId,
      monsterId,
      provenance: dto.provenance ?? "manual",
      personalityBig5: dto.personalityBig5 ?? {},
      motivation: dto.motivation,
      knowledgeScope: dto.knowledgeScope ?? [],
      dialogueStyle: dto.dialogueStyle,
      voiceNotes: dto.voiceNotes,
      tags: dto.tags ?? [],
    });
    return this.npcRepo.save(npc);
  }

  /**
   * Retorna NPC RAW (sem redaction). Uso interno do backend (services
   * que dependem de descriptionHidden/personality/etc — ex: scene-builders,
   * combat AI, dm-omniscient bypass). Controllers devem preferir getProjectedById.
   */
  async getById(npcId: string): Promise<NpcEntity> {
    const npc = await this.npcRepo.findOne({
      where: { id: npcId },
      relations: ["currentLocation", "monster"],
    });
    if (!npc) throw new NotFoundException("NPC nao encontrado.");
    return npc;
  }

  /** Spec 020 — variante com redaction filter aplicado. */
  async getProjectedById(
    npcId: string,
    options: NpcProjectionOptions = {},
  ): Promise<ProjectedNpc> {
    const npc = await this.getById(npcId);
    return projectNpc(npc, options);
  }

  /**
   * Retorna lista RAW (sem redaction). Uso interno apenas. Controllers do
   * agent-facing devem usar listByCampaignProjected.
   */
  async listByCampaign(campaignId: string): Promise<NpcEntity[]> {
    return this.npcRepo.find({
      where: { campaignId },
      relations: ["currentLocation"],
      order: { name: "ASC" },
    });
  }

  /** Spec 020 — variante com redaction filter aplicado. */
  async listByCampaignProjected(
    campaignId: string,
    options: NpcProjectionOptions = {},
  ): Promise<ProjectedNpc[]> {
    const npcs = await this.listByCampaign(campaignId);
    return projectNpcs(npcs, options);
  }

  async update(npcId: string, dto: Partial<CreateNpcDto>): Promise<NpcEntity> {
    const npc = await this.getById(npcId);
    Object.assign(npc, dto);
    return this.npcRepo.save(npc);
  }

  async remove(npcId: string): Promise<void> {
    await this.npcRepo.delete(npcId);
  }

  async moveNpc(npcId: string, locationId: string | null): Promise<NpcEntity> {
    const npc = await this.getById(npcId);
    npc.currentLocationId = locationId ?? undefined;
    return this.npcRepo.save(npc);
  }

  async getNpcsAtLocation(locationId: string): Promise<NpcEntity[]> {
    return this.npcRepo.find({
      where: { currentLocationId: locationId },
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

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const suffix = randomBytes(3).toString("hex");
    return `${base}-${suffix}`;
  }
}
