import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";
import { GameSessionEntity } from "./game-session.entity";
import { MonsterEntity } from "./monster.entity";
import { LocationEntity } from "./location.entity";
import { LocationPoiEntity } from "./location-poi.entity";

export type NpcProfileDepth = "core" | "supporting" | "expanded";

@Entity("npcs")
@Unique(["campaignId", "slug"])
export class NpcEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;


  @Index()
  @Column({ name: "game_session_id", type: "uuid", nullable: true })
  gameSessionId?: string;

  @ManyToOne(() => GameSessionEntity, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "game_session_id" })
  gameSession?: GameSessionEntity;

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "varchar" })
  slug: string;

  @Column({ type: "varchar", nullable: true })
  title?: string;

  @Column({ type: "varchar", nullable: true })
  race?: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ name: "description_hidden", type: "text", nullable: true })
  descriptionHidden?: string;

  @Column({ type: "varchar", nullable: true })
  motivation?: string;

  @Column({ name: "personality_big5", type: "jsonb", default: {} })
  personalityBig5: {
    openness?: number;
    conscientiousness?: number;
    extraversion?: number;
    agreeableness?: number;
    neuroticism?: number;
  };

  @Column({ name: "knowledge_scope", type: "jsonb", default: [] })
  knowledgeScope: string[];

  @Column({ name: "dialogue_style", type: "varchar", nullable: true })
  dialogueStyle?: string;

  @Column({ name: "voice_notes", type: "text", nullable: true })
  voiceNotes?: string;

  @Column({ name: "profile_depth", type: "varchar", length: 24, default: "core" })
  profileDepth: NpcProfileDepth;

  @Column({ name: "home_location_id", type: "uuid", nullable: true })
  homeLocationId?: string;

  @ManyToOne(() => LocationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "home_location_id" })
  homeLocation?: LocationEntity;

  @Column({ name: "home_poi_id", type: "uuid", nullable: true })
  homePoiId?: string;

  @ManyToOne(() => LocationPoiEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "home_poi_id" })
  homePoi?: LocationPoiEntity;

  @Column({ type: "jsonb", default: [] })
  tags: string[];

  @Column({ name: "monster_id", type: "uuid", nullable: true })
  monsterId?: string;

  @ManyToOne(() => MonsterEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "monster_id" })
  monster?: MonsterEntity;

  @Column({ type: "varchar", length: 24, default: "manual" })
  provenance: "manual" | "auto-materialized" | "director-planned";

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
