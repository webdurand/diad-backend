import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SceneEntity } from 'src/entities/scene.entity';
import { SceneNpcEntity } from 'src/entities/scene-npc.entity';

export interface CreateSceneDto {
  locationId?: string;
  title?: string;
  description?: string;
  mood?: string;
}

@Injectable()
export class SceneService {
  constructor(
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    @InjectRepository(SceneNpcEntity)
    private readonly sceneNpcRepo: Repository<SceneNpcEntity>,
  ) {}

  async create(
    sessionId: string,
    dto: CreateSceneDto,
  ): Promise<SceneEntity> {
    // Deactivate current active scene
    await this.sceneRepo.update(
      { sessionId, isActive: true },
      { isActive: false, endedAt: new Date() },
    );

    const nextNumber = await this.getNextSceneNumber(sessionId);

    const scene = this.sceneRepo.create({
      sessionId,
      sceneNumber: nextNumber,
      locationId: dto.locationId,
      title: dto.title,
      description: dto.description,
      mood: dto.mood,
      isActive: true,
      startedAt: new Date(),
    });
    return this.sceneRepo.save(scene);
  }

  async getActive(sessionId: string): Promise<SceneEntity | null> {
    return this.sceneRepo.findOne({
      where: { sessionId, isActive: true },
      relations: ['location'],
    });
  }

  async update(
    sceneId: string,
    dto: Partial<CreateSceneDto>,
  ): Promise<SceneEntity> {
    const scene = await this.sceneRepo.findOne({ where: { id: sceneId } });
    if (!scene) throw new NotFoundException('Cena nao encontrada.');
    Object.assign(scene, dto);
    return this.sceneRepo.save(scene);
  }

  async endScene(sceneId: string): Promise<void> {
    await this.sceneRepo.update(sceneId, {
      isActive: false,
      endedAt: new Date(),
    });
  }

  async addNpcToScene(sceneId: string, npcId: string): Promise<SceneNpcEntity> {
    const existing = await this.sceneNpcRepo.findOne({
      where: { sceneId, npcId },
    });
    if (existing) return existing;

    const sceneNpc = this.sceneNpcRepo.create({ sceneId, npcId });
    return this.sceneNpcRepo.save(sceneNpc);
  }

  async removeNpcFromScene(sceneId: string, npcId: string): Promise<void> {
    await this.sceneNpcRepo.delete({ sceneId, npcId });
  }

  async getSceneNpcs(sceneId: string): Promise<SceneNpcEntity[]> {
    return this.sceneNpcRepo.find({
      where: { sceneId },
      relations: ['npc'],
    });
  }

  async listBySession(sessionId: string): Promise<SceneEntity[]> {
    return this.sceneRepo.find({
      where: { sessionId },
      order: { sceneNumber: 'ASC' },
    });
  }

  private async getNextSceneNumber(sessionId: string): Promise<number> {
    const result = await this.sceneRepo
      .createQueryBuilder('s')
      .select('COALESCE(MAX(s.scene_number), 0)', 'max')
      .where('s.session_id = :sessionId', { sessionId })
      .getRawOne();
    return (parseInt(result.max, 10) || 0) + 1;
  }
}
