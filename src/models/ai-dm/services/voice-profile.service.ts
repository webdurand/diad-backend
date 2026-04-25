import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VoiceProfileEntity } from 'src/entities/voice-profile.entity';

@Injectable()
export class VoiceProfileService {
  constructor(
    @InjectRepository(VoiceProfileEntity)
    private readonly repo: Repository<VoiceProfileEntity>,
  ) {}

  async listAll(): Promise<VoiceProfileEntity[]> {
    return this.repo.find({
      order: { isSystemPreset: 'DESC', name: 'ASC' },
    });
  }

  async listSystemPresets(): Promise<VoiceProfileEntity[]> {
    return this.repo.find({
      where: { isSystemPreset: true },
      order: { name: 'ASC' },
    });
  }

  async getById(id: string): Promise<VoiceProfileEntity> {
    const profile = await this.repo.findOne({ where: { id } });
    if (!profile) {
      throw new NotFoundException({
        ok: false,
        error: 'Voice profile não encontrado.',
        code: 'VOICE_PROFILE_NOT_FOUND',
      });
    }
    return profile;
  }

  async getByName(name: string): Promise<VoiceProfileEntity> {
    const profile = await this.repo.findOne({ where: { name } });
    if (!profile) {
      throw new NotFoundException({
        ok: false,
        error: `Voice profile "${name}" não encontrado.`,
        code: 'VOICE_PROFILE_NOT_FOUND',
      });
    }
    return profile;
  }
}
