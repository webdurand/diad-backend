import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { LocationEntity } from './location.entity';

@Entity('location_connections')
@Unique(['fromLocationId', 'toLocationId'])
export class LocationConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'from_location_id', type: 'uuid' })
  fromLocationId: string;

  @ManyToOne(() => LocationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_location_id' })
  fromLocation: LocationEntity;

  @Column({ name: 'to_location_id', type: 'uuid' })
  toLocationId: string;

  @ManyToOne(() => LocationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_location_id' })
  toLocation: LocationEntity;

  @Column({ type: 'varchar', nullable: true })
  description?: string;

  @Column({ name: 'travel_time', type: 'varchar', nullable: true })
  travelTime?: string;

  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden: boolean;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked: boolean;

  @Column({ type: 'jsonb', default: {} })
  requirements: Record<string, any>;
}
