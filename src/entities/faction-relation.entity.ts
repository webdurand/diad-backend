import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { FactionEntity } from './faction.entity';

@Entity('faction_relations')
@Unique(['factionAId', 'factionBId'])
export class FactionRelationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'faction_a_id', type: 'uuid' })
  factionAId: string;

  @ManyToOne(() => FactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'faction_a_id' })
  factionA: FactionEntity;

  @Column({ name: 'faction_b_id', type: 'uuid' })
  factionBId: string;

  @ManyToOne(() => FactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'faction_b_id' })
  factionB: FactionEntity;

  @Column({ name: 'relation_type', type: 'varchar' })
  relationType: 'allied' | 'friendly' | 'neutral' | 'rival' | 'hostile' | 'war';

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'is_known_to_party', type: 'boolean', default: false })
  isKnownToParty: boolean;
}
