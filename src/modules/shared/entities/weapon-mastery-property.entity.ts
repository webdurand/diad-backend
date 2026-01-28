import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { WeaponMasteryProperty } from '../interfaces/weapon-mastery-property.interface';

@Entity('weapon__mastery_properties')
export class WeaponMasteryPropertyEntity implements WeaponMasteryProperty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;
}
