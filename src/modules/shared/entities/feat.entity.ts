import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Feat } from '../interfaces/feat.interface';

@Entity('feats')
export class FeatEntity implements Feat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  type: 'origin' | 'general' | 'fighting-style' | 'epic-boon';

  @Column({ type: 'text', nullable: true })
  repeatable?: string;

  @Column({ type: 'jsonb', nullable: true })
  prerequisites?: Feat['prerequisites'];

  @Column({ type: 'jsonb', nullable: true })
  prerequisite_options?: Feat['prerequisite_options'];

  @Column()
  url: string;
}
