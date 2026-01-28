import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Proficiency, Type } from '../interfaces/proficiency.interface';
import { ClassEntity } from './class.entity';
import { RaceEntity } from './race.entity';

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

  @ManyToMany(() => ClassEntity, (classEntity) => classEntity.proficiencies)
  @JoinTable()
  classes: ClassEntity[];

  @ManyToMany(() => RaceEntity)
  races: RaceEntity[];

  // Referência para o objeto real (ex: link para a Skill ou para o Equipment)
  @Column({ type: 'jsonb' })
  reference: Proficiency['reference'];
}
