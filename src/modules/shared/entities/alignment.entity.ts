import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Alignment } from '../interfaces/alignment.interface';

@Entity('alignments')
export class AlignmentEntity implements Alignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ length: 10 })
  abbreviation: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  url: string;
}
