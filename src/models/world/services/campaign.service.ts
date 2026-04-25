import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CampaignEntity,
  CampaignContentBudget,
  CampaignContentCounts,
  CampaignDmPersonality,
  CampaignTonalAnchor,
} from 'src/entities/campaign.entity';
import { CampaignPlayerEntity } from 'src/entities/campaign-player.entity';
import { randomBytes } from 'crypto';

export type BoundedCountKind = 'scenes' | 'npcs' | 'locations';

export interface CreateCampaignDto {
  name: string;
  description?: string;
  setting?: string;
  theme?: string;
  difficulty?: string;
}

export interface UpdateCampaignDto {
  name?: string;
  description?: string;
  setting?: string;
  theme?: string;
  difficulty?: string;
  status?: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  worldLore?: string;
}

export interface InitializeBudgetDto {
  contentBudget?: Partial<CampaignContentBudget>;
  dmPersonality?: CampaignDmPersonality;
  chaosFactor?: number;
  tonalAnchor?: CampaignTonalAnchor;
  centralQuestion?: string;
}

export interface UpdateBudgetDto {
  contentBudget?: Partial<CampaignContentBudget>;
  dmPersonality?: CampaignDmPersonality;
  chaosFactor?: number;
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
    const inviteCode = randomBytes(6).toString('hex');

    const campaign = this.campaignRepo.create({
      slug,
      name: dto.name,
      description: dto.description,
      setting: dto.setting,
      theme: dto.theme,
      difficulty: dto.difficulty ?? 'standard',
      dmUserId,
      status: 'draft',
      inviteCode,
    });

    const saved = await this.campaignRepo.save(campaign);

    // Auto-add DM as player
    const dmPlayer = this.playerRepo.create({
      campaignId: saved.id,
      userId: dmUserId,
      isActive: true,
    });
    await this.playerRepo.save(dmPlayer);

    return saved;
  }

  async listByUser(userId: string): Promise<CampaignEntity[]> {
    const players = await this.playerRepo.find({
      where: { userId, isActive: true },
      relations: ['campaign'],
    });
    return players.map((p) => p.campaign).filter(Boolean);
  }

  async getById(campaignId: string): Promise<CampaignEntity> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campanha nao encontrada.');
    return campaign;
  }

  async getByInviteCode(code: string): Promise<CampaignEntity> {
    const campaign = await this.campaignRepo.findOne({
      where: { inviteCode: code },
    });
    if (!campaign) throw new NotFoundException('Convite invalido.');
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
    if (!player) throw new NotFoundException('Jogador nao encontrado na campanha.');
    player.characterId = characterId;
    return this.playerRepo.save(player);
  }

  async removePlayer(
    campaignId: string,
    userId: string,
  ): Promise<void> {
    await this.playerRepo.update(
      { campaignId, userId },
      { isActive: false },
    );
  }

  async getPlayers(campaignId: string): Promise<CampaignPlayerEntity[]> {
    return this.playerRepo.find({
      where: { campaignId, isActive: true },
      relations: ['user', 'character'],
    });
  }

  async ensureDmOwnership(
    campaignId: string,
    userId: string,
  ): Promise<CampaignEntity> {
    const campaign = await this.getById(campaignId);
    if (campaign.dmUserId !== userId) {
      throw new NotFoundException('Campanha nao encontrada.');
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
    if (!player) throw new NotFoundException('Voce nao faz parte desta campanha.');
    return player;
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = randomBytes(3).toString('hex');
    return `${base}-${suffix}`;
  }

  // ===== Spec 014 M1: Bounded World + Closure =====

  async initializeWithBudget(
    campaignId: string,
    dto: InitializeBudgetDto,
  ): Promise<CampaignEntity> {
    const campaign = await this.getById(campaignId);
    if (dto.contentBudget) {
      campaign.contentBudget = {
        maxScenes: dto.contentBudget.maxScenes ?? campaign.contentBudget.maxScenes,
        maxNpcs: dto.contentBudget.maxNpcs ?? campaign.contentBudget.maxNpcs,
        maxLocations:
          dto.contentBudget.maxLocations ?? campaign.contentBudget.maxLocations,
      };
    }
    if (dto.dmPersonality) campaign.dmPersonality = dto.dmPersonality;
    if (typeof dto.chaosFactor === 'number') {
      this.assertChaosRange(dto.chaosFactor);
      campaign.chaosFactor = dto.chaosFactor;
    }
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
        maxScenes: dto.contentBudget.maxScenes ?? campaign.contentBudget.maxScenes,
        maxNpcs: dto.contentBudget.maxNpcs ?? campaign.contentBudget.maxNpcs,
        maxLocations:
          dto.contentBudget.maxLocations ?? campaign.contentBudget.maxLocations,
      };
    }
    if (dto.dmPersonality) campaign.dmPersonality = dto.dmPersonality;
    if (typeof dto.chaosFactor === 'number') {
      this.assertChaosRange(dto.chaosFactor);
      campaign.chaosFactor = dto.chaosFactor;
    }
    if (dto.tonalAnchor) campaign.tonalAnchor = dto.tonalAnchor;
    if (dto.centralQuestion !== undefined) {
      campaign.centralQuestion = dto.centralQuestion;
    }
    if (typeof dto.questionStatedAtScene === 'number') {
      campaign.questionStatedAtScene = dto.questionStatedAtScene;
    }
    if (typeof dto.questionAnswered === 'boolean') {
      campaign.questionAnswered = dto.questionAnswered;
    }
    if (dto.questionAnswer !== undefined) {
      campaign.questionAnswer = dto.questionAnswer;
    }
    return this.campaignRepo.save(campaign);
  }

  /**
   * Atomic increment do counter `kind`, rejeitando se budget.max<kind> já foi atingido.
   * Race-safe: uma única query UPDATE ... WHERE (count<max) RETURNING
   * garante que concorrência não consiga passar do budget.
   *
   * Throws ConflictException({code:'BUDGET_EXCEEDED', kind}) quando estourar.
   */
  async incrementCount(
    campaignId: string,
    kind: BoundedCountKind,
  ): Promise<CampaignContentCounts> {
    const key = kind;
    const maxKey =
      kind === 'scenes' ? 'maxScenes' : kind === 'npcs' ? 'maxNpcs' : 'maxLocations';

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

    // TypeORM repo.query pode retornar `rows[]`, `[rows, affected]`, ou
    // `QueryResult{rows, rowCount}` dependendo do driver/versão. Normaliza.
    const rows = this.normalizeQueryRows(raw);

    if (rows.length === 0) {
      const campaign = await this.getById(campaignId); // throws NotFound se id inválido
      throw new ConflictException({
        ok: false,
        error: `Orçamento da campanha para ${kind} foi atingido.`,
        code: 'BUDGET_EXCEEDED',
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
      // Caso A: rows[] direto -> objetos com chaves
      // Caso B: [rows, affected] tuple (raro no 0.3.x)
      if (raw.length === 0) return [];
      const first = raw[0];
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        return raw as Array<Record<string, any>>;
      }
      if (Array.isArray(first)) return first as Array<Record<string, any>>;
      return [];
    }
    if (typeof raw === 'object' && raw !== null && 'rows' in (raw as any)) {
      return ((raw as any).rows ?? []) as Array<Record<string, any>>;
    }
    return [];
  }

  private assertChaosRange(value: number): void {
    if (value < 1 || value > 9 || !Number.isInteger(value)) {
      throw new ConflictException({
        ok: false,
        error: 'chaosFactor deve ser inteiro entre 1 e 9.',
        code: 'CHAOS_FACTOR_OUT_OF_RANGE',
        value,
      });
    }
  }
}
