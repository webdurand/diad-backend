import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AbilityScoreEntity } from '../shared/entities/ability-scores.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AbilityScoreEntity)
    private readonly abilityScoreRepository: Repository<AbilityScoreEntity>,
  ) {}
  async uploadJsonAbilityScore(jsonData: any[]): Promise<void> {
    for (const item of jsonData) {
      const abilityScore = this.abilityScoreRepository.create(item);
      await this.abilityScoreRepository.save(abilityScore);
    }
  }
}
