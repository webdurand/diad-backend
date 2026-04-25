import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type VoicePacing = 'rapido' | 'medio' | 'lento';

export type VoiceSceneType =
  | 'combat'
  | 'social'
  | 'exploration'
  | 'reveal'
  | 'epilogue';

export interface VoiceFewShotExample {
  sceneType: VoiceSceneType;
  contextInput: string;
  expectedProse: string;
}

export interface VoiceEmotionalTriggers {
  onCharacterDeath?: string;
  onVictoryClimax?: string;
  onBetrayal?: string;
  onDiscovery?: string;
  onEpilogue?: string;
}

@Entity('voice_profiles')
export class VoiceProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  name: string;

  @Column({ name: 'core_identity', type: 'text' })
  coreIdentity: string;

  @Column({ name: 'speech_patterns', type: 'jsonb', default: [] })
  speechPatterns: string[];

  @Column({ name: 'emotional_triggers', type: 'jsonb', default: {} })
  emotionalTriggers: VoiceEmotionalTriggers;

  @Column({ name: 'forbidden_tropes', type: 'jsonb', default: [] })
  forbiddenTropes: string[];

  @Column({ type: 'jsonb', default: [] })
  constraints: string[];

  @Column({ name: 'few_shot_examples', type: 'jsonb', default: [] })
  fewShotExamples: VoiceFewShotExample[];

  @Column({ type: 'varchar', default: 'medio' })
  pacing: VoicePacing;

  @Index()
  @Column({ name: 'is_system_preset', type: 'boolean', default: false })
  isSystemPreset: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
