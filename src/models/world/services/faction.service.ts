import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FactionEntity } from "src/entities/faction.entity";
import { FactionRelationEntity } from "src/entities/faction-relation.entity";
import { randomBytes } from "crypto";

export interface CreateFactionDto {
  name: string;
  description?: string;
  goals?: string[];
  alignment?: string;
  influenceLevel?: number;
  headquartersLocationId?: string;
  tags?: string[];
}

export interface SetFactionRelationDto {
  factionBId: string;
  relationType: "allied" | "friendly" | "neutral" | "rival" | "hostile" | "war";
  description?: string;
  isKnownToParty?: boolean;
}

@Injectable()
export class FactionService {
  constructor(
    @InjectRepository(FactionEntity)
    private readonly factionRepo: Repository<FactionEntity>,
    @InjectRepository(FactionRelationEntity)
    private readonly relationRepo: Repository<FactionRelationEntity>,
  ) {}

  async create(
    campaignId: string,
    dto: CreateFactionDto,
  ): Promise<FactionEntity> {
    const slug = this.generateSlug(dto.name);
    const faction = this.factionRepo.create({
      campaignId,
      slug,
      name: dto.name,
      description: dto.description,
      goals: dto.goals ?? [],
      alignment: dto.alignment,
      influenceLevel: dto.influenceLevel ?? 5,
      headquartersLocationId: dto.headquartersLocationId,
      tags: dto.tags ?? [],
    });
    return this.factionRepo.save(faction);
  }

  async listByCampaign(campaignId: string): Promise<FactionEntity[]> {
    return this.factionRepo.find({
      where: { campaignId },
      order: { name: "ASC" },
    });
  }

  async getById(factionId: string): Promise<FactionEntity> {
    const faction = await this.factionRepo.findOne({
      where: { id: factionId },
    });
    if (!faction) throw new NotFoundException("Faccao nao encontrada.");
    return faction;
  }

  async update(
    factionId: string,
    dto: Partial<CreateFactionDto>,
  ): Promise<FactionEntity> {
    const faction = await this.getById(factionId);
    Object.assign(faction, dto);
    return this.factionRepo.save(faction);
  }

  async remove(factionId: string): Promise<void> {
    await this.factionRepo.delete(factionId);
  }

  async setRelation(
    factionAId: string,
    dto: SetFactionRelationDto,
  ): Promise<FactionRelationEntity> {
    // Normalize order: smaller UUID first
    const [a, b] =
      factionAId < dto.factionBId
        ? [factionAId, dto.factionBId]
        : [dto.factionBId, factionAId];

    let rel = await this.relationRepo.findOne({
      where: { factionAId: a, factionBId: b },
    });

    if (rel) {
      rel.relationType = dto.relationType;
      rel.description = dto.description ?? rel.description;
      rel.isKnownToParty = dto.isKnownToParty ?? rel.isKnownToParty;
    } else {
      rel = this.relationRepo.create({
        factionAId: a,
        factionBId: b,
        relationType: dto.relationType,
        description: dto.description,
        isKnownToParty: dto.isKnownToParty ?? false,
      });
    }

    return this.relationRepo.save(rel);
  }

  async getRelations(campaignId: string): Promise<FactionRelationEntity[]> {
    const factions = await this.factionRepo.find({
      where: { campaignId },
      select: ["id"],
    });
    const ids = factions.map((f) => f.id);
    if (ids.length === 0) return [];

    return this.relationRepo
      .createQueryBuilder("r")
      .leftJoinAndSelect("r.factionA", "a")
      .leftJoinAndSelect("r.factionB", "b")
      .where("r.faction_a_id IN (:...ids)", { ids })
      .getMany();
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
