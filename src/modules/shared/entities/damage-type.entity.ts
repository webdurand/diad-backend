import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { DamageType } from '../interfaces/damage-type.interface';

@Entity('damage_types')
export class DamageTypeEntity implements DamageType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;
}
