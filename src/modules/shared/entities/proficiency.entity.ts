import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Proficiency, Type } from '../interfaces/proficiency.interface';

@Entity('proficiencies')
export class ProficiencyEntity implements Proficiency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: Type,
  })
  type: Type;

  // Lista de classes que podem ter essa proficiência
  @Column({ type: 'jsonb' })
  classes: Proficiency['classes'];

  // Lista de raças que podem ter essa proficiência
  @Column({ type: 'jsonb' })
  races: Proficiency['races'];

  // Referência para o objeto real (ex: link para a Skill ou para o Equipment)
  @Column({ type: 'jsonb' })
  reference: Proficiency['reference'];

  @Column()
  url: string;
}
