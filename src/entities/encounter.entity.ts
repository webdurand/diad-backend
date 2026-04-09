import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GameSessionEntity } from './game-session.entity';
import { EncounterParticipantEntity } from './encounter-participant.entity';

@Entity('encounters')
export class EncounterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: GameSessionEntity;

  @Column({ type: 'varchar' })
  name: string;

  @Column({
    type: 'varchar',
    default: 'preparing',
  })
  status: 'preparing' | 'rolling_initiative' | 'active' | 'completed';

  @Column({ name: 'current_round', type: 'int', default: 1 })
  currentRound: number;

  @Column({ name: 'current_turn_index', type: 'int', default: 0 })
  currentTurnIndex: number;

  @Column({ name: 'turn_order', type: 'jsonb', default: [] })
  turnOrder: string[];

  @Column({ type: 'jsonb', nullable: true })
  difficulty?: {
    adjusted_xp: number;
    threshold: string;
    total_monster_xp: number;
    party_level_summary: Record<number, number>;
  };

  @OneToMany(() => EncounterParticipantEntity, (p) => p.encounter)
  participants?: EncounterParticipantEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
