import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";
import { CampaignPartyMemberEntity } from "./campaign-party-member.entity";

export interface PersonalityBig5 {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface CompanionIntroductionHook {
  locationId: string;
  triggerSceneHint?: string | null;
  minimumSceneNumber?: number | null;
  expiresAfterRecruitment?: boolean;
}

@Entity("companion_templates")
@Unique(["campaignId", "slug"])
export class CompanionTemplateEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "varchar" })
  slug: string;

  @Column({ type: "varchar" })
  race: string;

  @Column({ name: "portrait_url", type: "varchar", nullable: true })
  portraitUrl?: string | null;

  @Column({ name: "personality_big5", type: "jsonb", default: {} })
  personalityBig5: PersonalityBig5;

  @Column({ name: "dialogue_style", type: "text" })
  dialogueStyle: string;

  @Column({ name: "voice_notes", type: "text" })
  voiceNotes: string;

  @Column({ type: "text" })
  motivation: string;

  @Column({ name: "companion_profile", type: "jsonb", nullable: true })
  companionProfile?: Record<string, unknown> | null;

  @Column({ name: "suggested_build", type: "jsonb", nullable: true })
  suggestedBuild?: Record<string, unknown> | null;

  @Column({ name: "introduction_hook", type: "jsonb", nullable: true })
  introductionHook?: CompanionIntroductionHook | null;

  @Column({ name: "display_order", type: "int", default: 0 })
  displayOrder: number;

  @OneToMany(() => CampaignPartyMemberEntity, (member) => member.template)
  partyMembers?: CampaignPartyMemberEntity[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
