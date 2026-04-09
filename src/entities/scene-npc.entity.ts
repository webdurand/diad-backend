import {
  Entity,
  Column,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { SceneEntity } from './scene.entity';
import { NpcEntity } from './npc.entity';

@Entity('scene_npcs')
@Unique(['sceneId', 'npcId'])
export class SceneNpcEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'scene_id', type: 'uuid' })
  sceneId: string;

  @ManyToOne(() => SceneEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scene_id' })
  scene: SceneEntity;

  @Column({ name: 'npc_id', type: 'uuid' })
  npcId: string;

  @ManyToOne(() => NpcEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'npc_id' })
  npc: NpcEntity;
}
