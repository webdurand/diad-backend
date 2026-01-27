import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { MagicSchool } from '../interfaces/magic-school.interface';

@Entity('magic_schools')
export class MagicSchoolEntity implements MagicSchool {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  url: string;
}
