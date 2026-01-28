import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { WeaponProperty } from '../interfaces/weapon-property.interface';

@Entity('weapon_properties')
export class WeaponPropertyEntity implements WeaponProperty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;
}
