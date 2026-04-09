import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignEntity } from 'src/entities/campaign.entity';
import { CampaignPlayerEntity } from 'src/entities/campaign-player.entity';
import { randomBytes } from 'crypto';

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
}
