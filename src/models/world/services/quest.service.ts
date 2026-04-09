import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuestEntity } from 'src/entities/quest.entity';
import { QuestObjectiveEntity } from 'src/entities/quest-objective.entity';
import { QuestPrerequisiteEntity } from 'src/entities/quest-prerequisite.entity';
import { randomBytes } from 'crypto';

export interface CreateQuestDto {
  name: string;
  description?: string;
  descriptionHidden?: string;
  storyArcId?: string;
  giverNpcId?: string;
  locationId?: string;
  rewards?: { xp?: number; gold?: number; items?: string[]; reputation?: Record<string, number> };
  levelRange?: { min?: number; max?: number };
  objectives?: Array<{
    description: string;
    pathGroup?: string;
    isOptional?: boolean;
  }>;
}

export interface UpdateQuestDto {
  name?: string;
  description?: string;
  descriptionHidden?: string;
  status?: 'unknown' | 'available' | 'active' | 'completed' | 'failed' | 'abandoned';
  storyArcId?: string;
  giverNpcId?: string;
  locationId?: string;
  rewards?: Record<string, any>;
}

@Injectable()
export class QuestService {
  constructor(
    @InjectRepository(QuestEntity)
    private readonly questRepo: Repository<QuestEntity>,
    @InjectRepository(QuestObjectiveEntity)
    private readonly objectiveRepo: Repository<QuestObjectiveEntity>,
    @InjectRepository(QuestPrerequisiteEntity)
    private readonly prereqRepo: Repository<QuestPrerequisiteEntity>,
  ) {}

  async create(
    campaignId: string,
    dto: CreateQuestDto,
  ): Promise<QuestEntity> {
    const slug = this.generateSlug(dto.name);
    const quest = this.questRepo.create({
      campaignId,
      slug,
      name: dto.name,
      description: dto.description,
      descriptionHidden: dto.descriptionHidden,
      storyArcId: dto.storyArcId,
      giverNpcId: dto.giverNpcId,
      locationId: dto.locationId,
      rewards: dto.rewards ?? {},
      levelRange: dto.levelRange,
      status: 'unknown',
    });

    const saved = await this.questRepo.save(quest);

    if (dto.objectives?.length) {
      const objectives = dto.objectives.map((o, i) =>
        this.objectiveRepo.create({
          questId: saved.id,
          description: o.description,
          pathGroup: o.pathGroup,
          isOptional: o.isOptional ?? false,
          sortOrder: i,
          status: 'locked',
        }),
      );
      await this.objectiveRepo.save(objectives);
    }

    return this.getById(saved.id);
  }

  async getById(questId: string): Promise<QuestEntity> {
    const quest = await this.questRepo.findOne({
      where: { id: questId },
      relations: ['objectives', 'giverNpc', 'location', 'storyArc'],
    });
    if (!quest) throw new NotFoundException('Quest nao encontrada.');
    return quest;
  }

  async listByCampaign(
    campaignId: string,
    status?: string,
  ): Promise<QuestEntity[]> {
    const where: any = { campaignId };
    if (status) where.status = status;
    return this.questRepo.find({
      where,
      relations: ['objectives'],
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async update(questId: string, dto: UpdateQuestDto): Promise<QuestEntity> {
    const quest = await this.getById(questId);
    Object.assign(quest, dto);
    const saved = await this.questRepo.save(quest);

    // If quest completed, unlock dependent quests
    if (dto.status === 'completed' || dto.status === 'failed') {
      await this.cascadeUnlock(saved);
    }

    return this.getById(saved.id);
  }

  async updateObjectiveStatus(
    objectiveId: string,
    status: 'locked' | 'active' | 'completed' | 'failed' | 'optional',
  ): Promise<QuestObjectiveEntity> {
    const obj = await this.objectiveRepo.findOne({
      where: { id: objectiveId },
    });
    if (!obj) throw new NotFoundException('Objetivo nao encontrado.');
    obj.status = status;
    return this.objectiveRepo.save(obj);
  }

  async addPrerequisite(
    questId: string,
    requiredQuestId: string,
    requiredStatus = 'completed',
  ): Promise<QuestPrerequisiteEntity> {
    const prereq = this.prereqRepo.create({
      questId,
      requiredQuestId,
      requiredStatus,
    });
    return this.prereqRepo.save(prereq);
  }

  async getAvailableQuests(campaignId: string): Promise<QuestEntity[]> {
    const allQuests = await this.questRepo.find({
      where: { campaignId },
    });

    const prereqs = await this.prereqRepo.find();
    const prereqMap = new Map<string, QuestPrerequisiteEntity[]>();
    for (const p of prereqs) {
      const list = prereqMap.get(p.questId) ?? [];
      list.push(p);
      prereqMap.set(p.questId, list);
    }

    const questStatusMap = new Map(allQuests.map((q) => [q.id, q.status]));

    return allQuests.filter((q) => {
      if (q.status !== 'unknown') return false;
      const reqs = prereqMap.get(q.id) ?? [];
      return reqs.every(
        (r) => questStatusMap.get(r.requiredQuestId) === r.requiredStatus,
      );
    });
  }

  async remove(questId: string): Promise<void> {
    await this.questRepo.delete(questId);
  }

  private async cascadeUnlock(quest: QuestEntity): Promise<void> {
    // Find quests that depend on this one
    const dependents = await this.prereqRepo.find({
      where: { requiredQuestId: quest.id },
    });

    for (const dep of dependents) {
      // Check if ALL prereqs for the dependent quest are met
      const allPrereqs = await this.prereqRepo.find({
        where: { questId: dep.questId },
      });

      const depQuest = await this.questRepo.findOne({
        where: { id: dep.questId },
      });
      if (!depQuest || depQuest.status !== 'unknown') continue;

      const allMet = await Promise.all(
        allPrereqs.map(async (p) => {
          const req = await this.questRepo.findOne({
            where: { id: p.requiredQuestId },
          });
          return req?.status === p.requiredStatus;
        }),
      );

      if (allMet.every(Boolean)) {
        depQuest.status = 'available';
        await this.questRepo.save(depQuest);
      }
    }
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = randomBytes(3).toString('hex');
    return `${base}-${suffix}`;
  }
}
