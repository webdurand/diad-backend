import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Condition } from '../interfaces/condition.interface';

@Entity('conditions')
export class ConditionEntity implements Condition {
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
