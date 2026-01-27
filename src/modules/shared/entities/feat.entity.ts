import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Feat, FeatType } from '../interfaces/feat.interface';

@Entity('feats')
export class FeatEntity implements Feat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: FeatType,
  })
  type: FeatType;

  @Column({ type: 'text', nullable: true })
  repeatable?: string;

  @Column({ type: 'jsonb', nullable: true })
  prerequisites?: Feat['prerequisites'];

  @Column({ type: 'jsonb', nullable: true })
  prerequisite_options?: Feat['prerequisite_options'];

  @Column()
  url: string;
}
