import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('comp_sources')
export class CompSourceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  abbreviation: string;

  @Column({ nullable: true })
  edition: string;

  @Column({ nullable: true })
  year: number;

  @Column({ nullable: true })
  group: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  created_at: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updated_at: Date;
}