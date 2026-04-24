import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LoreEntryEntity,
  LoreEntryEntityType,
} from 'src/entities/lore-entry.entity';

export interface CreateLoreEntryDto {
  name: string;
  description: string;
  activationKeys: string[];
  entityType?: LoreEntryEntityType;
  entityId?: string;
  isPersistent?: boolean;
  priority?: number;
  maxTokensInject?: number;
}

@Injectable()
export class LoreEntryService {
  constructor(
    @InjectRepository(LoreEntryEntity)
    private readonly repo: Repository<LoreEntryEntity>,
  ) {}

  async create(
    campaignId: string,
    dto: CreateLoreEntryDto,
  ): Promise<LoreEntryEntity> {
    if (!dto.activationKeys?.length) {
      throw new BadRequestException({
        ok: false,
        error: 'Lore entry precisa de pelo menos uma activationKey.',
        code: 'LORE_ENTRY_NO_KEYS',
      });
    }
    const entry = this.repo.create({
      campaignId,
      name: dto.name,
      description: dto.description,
      activationKeys: dto.activationKeys.map((k) => k.toLowerCase().trim()).filter(Boolean),
      entityType: dto.entityType ?? 'lore',
      entityId: dto.entityId,
      isPersistent: dto.isPersistent ?? true,
      priority: this.clampPriority(dto.priority ?? 5),
      maxTokensInject: dto.maxTokensInject ?? 400,
    });
    return this.repo.save(entry);
  }

  async listByCampaign(campaignId: string): Promise<LoreEntryEntity[]> {
    return this.repo.find({
      where: { campaignId },
      order: { priority: 'DESC', createdAt: 'ASC' },
    });
  }

  async getById(id: string): Promise<LoreEntryEntity> {
    const entry = await this.repo.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException({
        ok: false,
        error: 'Lore entry não encontrada.',
        code: 'LORE_ENTRY_NOT_FOUND',
      });
    }
    return entry;
  }

  /**
   * Retorna entries ativadas por keyword match (case-insensitive substring)
   * no texto recente. Ordenadas por priority desc.
   */
  async matchActivation(
    campaignId: string,
    recentText: string,
  ): Promise<LoreEntryEntity[]> {
    const lower = recentText.toLowerCase();
    const all = await this.listByCampaign(campaignId);
    return all.filter((entry) =>
      entry.activationKeys.some((key) => lower.includes(key)),
    );
  }

  private clampPriority(value: number): number {
    if (!Number.isFinite(value)) return 5;
    return Math.max(0, Math.min(10, Math.round(value)));
  }
}
