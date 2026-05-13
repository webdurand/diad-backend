import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NpcRelationshipEntity } from "src/entities/npc-relationship.entity";

export type RelationshipType =
  | "family"
  | "friend"
  | "rival"
  | "employer"
  | "mentor"
  | "enemy"
  | "leader"
  | "member"
  | "agent"
  | "ally"
  | "wary";

export interface CreateNpcRelationshipDto {
  sourceNpcId: string;
  targetNpcId?: string;
  targetFactionId?: string;
  relationshipType: RelationshipType;
  description?: string;
  strength?: number;
  isKnownToParty?: boolean;
}

export type UpdateNpcRelationshipDto = Partial<
  Omit<CreateNpcRelationshipDto, "sourceNpcId">
>;

@Injectable()
export class NpcRelationshipService {
  constructor(
    @InjectRepository(NpcRelationshipEntity)
    private readonly relRepo: Repository<NpcRelationshipEntity>,
  ) {}

  async create(dto: CreateNpcRelationshipDto): Promise<NpcRelationshipEntity> {
    if (!dto.targetNpcId && !dto.targetFactionId) {
      throw new Error(
        "Relationship precisa de targetNpcId OU targetFactionId.",
      );
    }
    const rel = this.relRepo.create({
      sourceNpcId: dto.sourceNpcId,
      targetNpcId: dto.targetNpcId,
      targetFactionId: dto.targetFactionId,
      relationshipType: dto.relationshipType,
      description: dto.description,
      strength: dto.strength ?? 5,
      isKnownToParty: dto.isKnownToParty ?? false,
    });
    return this.relRepo.save(rel);
  }

  async listBySourceNpc(npcId: string): Promise<NpcRelationshipEntity[]> {
    return this.relRepo.find({
      where: { sourceNpcId: npcId },
      relations: ["targetNpc", "targetFaction"],
    });
  }

  async listByCampaign(campaignId: string): Promise<NpcRelationshipEntity[]> {

    return this.relRepo
      .createQueryBuilder("r")
      .innerJoin("npcs", "src", "src.id = r.source_npc_id")
      .leftJoinAndSelect("r.targetNpc", "targetNpc")
      .leftJoinAndSelect("r.targetFaction", "targetFaction")
      .where("src.campaign_id = :campaignId", { campaignId })
      .getMany();
  }

  async getById(relId: string): Promise<NpcRelationshipEntity> {
    const rel = await this.relRepo.findOne({ where: { id: relId } });
    if (!rel) throw new NotFoundException("Relationship nao encontrado.");
    return rel;
  }

  async update(
    relId: string,
    dto: UpdateNpcRelationshipDto,
  ): Promise<NpcRelationshipEntity> {
    const rel = await this.getById(relId);
    Object.assign(rel, dto);
    return this.relRepo.save(rel);
  }

  async remove(relId: string): Promise<void> {
    await this.relRepo.delete(relId);
  }
}
