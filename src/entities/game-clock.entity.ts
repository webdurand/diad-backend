import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";

/**
 * Spec 019 — relógio in-game único por campanha (1:1 CampaignEntity).
 *
 * `currentInGameDateTime` armazena ano fictício do mundo (ex: 1492 DR
 * Forgotten Realms). Sunrise/sunset configuráveis por campanha em formato
 * HH:mm (default 06:00 / 18:00). `daysPassed` é contador desde início pra
 * exhaustion ticks e deadlines narrativas.
 *
 * `timeOfDay` é DERIVADO via pure function `computeTimeOfDay()` —
 * NÃO persistido (evita drift entre fields).
 */
@Entity("game_clocks")
export class GameClockEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @OneToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Column({
    name: "current_in_game_datetime",
    type: "timestamptz",
    default: () => "now()",
  })
  currentInGameDateTime: Date;

  /** Formato HH:mm — default 06:00. */
  @Column({
    name: "sunrise_time",
    type: "varchar",
    length: 5,
    default: "06:00",
  })
  sunriseTime: string;

  /** Formato HH:mm — default 18:00. */
  @Column({
    name: "sunset_time",
    type: "varchar",
    length: 5,
    default: "18:00",
  })
  sunsetTime: string;

  @Column({ name: "days_passed", type: "int", default: 0 })
  daysPassed: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
