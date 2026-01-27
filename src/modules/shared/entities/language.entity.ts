import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { Language } from '../interfaces/language.interface';

@Entity('languages')
export class LanguageEntity implements Language {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column()
  url: string;

  @Column({ name: 'is_rare', type: 'boolean', default: false })
  is_rare: boolean;

  @Column({ type: 'text', nullable: true })
  note: string;
}
