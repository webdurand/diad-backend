import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { StoryArcEntity } from "src/entities/story-arc.entity";

export interface CreateStoryArcDto {
  name: string;
  description?: string;
  sortOrder?: number;
  isMainArc?: boolean;
  isActive?: boolean;
}

export type UpdateStoryArcDto = Partial<CreateStoryArcDto>;

@Injectable()
export class StoryArcService {
  constructor(
    @InjectRepository(StoryArcEntity)
    private readonly arcRepo: Repository<StoryArcEntity>,
  ) {}

  async create(
    campaignId: string,
    dto: CreateStoryArcDto,
  ): Promise<StoryArcEntity> {
    const arc = this.arcRepo.create({
      campaignId,
      name: dto.name,
      description: dto.description,
      sortOrder: dto.sortOrder ?? 0,
      isMainArc: dto.isMainArc ?? false,
      isActive: dto.isActive ?? true,
    });
    return this.arcRepo.save(arc);
  }

  async listByCampaign(campaignId: string): Promise<StoryArcEntity[]> {
    return this.arcRepo.find({
      where: { campaignId },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
  }

  async getById(arcId: string): Promise<StoryArcEntity> {
    const arc = await this.arcRepo.findOne({ where: { id: arcId } });
    if (!arc) throw new NotFoundException("Story arc nao encontrado.");
    return arc;
  }

  async getMainArc(campaignId: string): Promise<StoryArcEntity | null> {
    return this.arcRepo.findOne({
      where: { campaignId, isMainArc: true, isActive: true },
    });
  }

  async update(
    arcId: string,
    dto: UpdateStoryArcDto,
  ): Promise<StoryArcEntity> {
    const arc = await this.getById(arcId);
    Object.assign(arc, dto);
    return this.arcRepo.save(arc);
  }

  async remove(arcId: string): Promise<void> {
    await this.arcRepo.delete(arcId);
  }
}
