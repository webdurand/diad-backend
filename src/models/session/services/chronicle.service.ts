import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignChronicleEntity } from 'src/entities/campaign-chronicle.entity';
import { PartyKnowledgeEntity } from 'src/entities/party-knowledge.entity';

export interface CreateChronicleDto {
  campaignId: string;
  sessionId?: string;
  entryDate?: string;
  title: string;
  content: string;
  entityChanges?: Record<string, any>;
  significance?: number;
}

export interface RecordKnowledgeDto {
  campaignId: string;
  entityType: string;
  entityId: string;
  knowledgeKey: string;
  knowledgeValue?: string;
  discoveredInSessionId?: string;
}

@Injectable()
export class ChronicleService {
  constructor(
    @InjectRepository(CampaignChronicleEntity)
    private readonly chronicleRepo: Repository<CampaignChronicleEntity>,
    @InjectRepository(PartyKnowledgeEntity)
    private readonly knowledgeRepo: Repository<PartyKnowledgeEntity>,
  ) {}

  // --- Chronicles ---

  async createChronicle(
    dto: CreateChronicleDto,
  ): Promise<CampaignChronicleEntity> {
    const entry = this.chronicleRepo.create({
      campaignId: dto.campaignId,
      sessionId: dto.sessionId,
      entryDate: dto.entryDate,
      title: dto.title,
      content: dto.content,
      entityChanges: dto.entityChanges ?? {},
      significance: dto.significance ?? 5,
    });
    return this.chronicleRepo.save(entry);
  }

  async getChronicles(
    campaignId: string,
    limit = 20,
    minSignificance = 1,
  ): Promise<CampaignChronicleEntity[]> {
    return this.chronicleRepo
      .createQueryBuilder('c')
      .where('c.campaign_id = :campaignId', { campaignId })
      .andWhere('c.significance >= :min', { min: minSignificance })
      .orderBy('c.significance', 'DESC')
      .addOrderBy('c.created_at', 'DESC')
      .take(limit)
      .getMany();
  }

  async getSessionChronicle(
    sessionId: string,
  ): Promise<CampaignChronicleEntity | null> {
    return this.chronicleRepo.findOne({
      where: { sessionId },
    });
  }

  // --- Party Knowledge ---

  async recordKnowledge(
    dto: RecordKnowledgeDto,
  ): Promise<PartyKnowledgeEntity> {
    const existing = await this.knowledgeRepo.findOne({
      where: {
        campaignId: dto.campaignId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        knowledgeKey: dto.knowledgeKey,
      },
    });

    if (existing) {
      if (dto.knowledgeValue !== undefined) {
        existing.knowledgeValue = dto.knowledgeValue;
      }
      return this.knowledgeRepo.save(existing);
    }

    const knowledge = this.knowledgeRepo.create({
      campaignId: dto.campaignId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      knowledgeKey: dto.knowledgeKey,
      knowledgeValue: dto.knowledgeValue,
      discoveredInSessionId: dto.discoveredInSessionId,
    });
    return this.knowledgeRepo.save(knowledge);
  }

  async getKnowledge(campaignId: string): Promise<PartyKnowledgeEntity[]> {
    return this.knowledgeRepo.find({
      where: { campaignId },
      order: { createdAt: 'DESC' },
    });
  }

  async getKnowledgeForEntity(
    campaignId: string,
    entityType: string,
    entityId: string,
  ): Promise<PartyKnowledgeEntity[]> {
    return this.knowledgeRepo.find({
      where: { campaignId, entityType, entityId },
    });
  }

  async getRelevantKnowledge(
    campaignId: string,
    filters: { locationId?: string; npcIds?: string[] },
  ): Promise<PartyKnowledgeEntity[]> {
    const qb = this.knowledgeRepo
      .createQueryBuilder('pk')
      .where('pk.campaign_id = :campaignId', { campaignId });

    const entityIds: string[] = [];
    if (filters.locationId) entityIds.push(filters.locationId);
    if (filters.npcIds?.length) entityIds.push(...filters.npcIds);

    if (entityIds.length > 0) {
      qb.andWhere('pk.entity_id IN (:...entityIds)', { entityIds });
    }

    return qb.getMany();
  }
}
