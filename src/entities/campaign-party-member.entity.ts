import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";
import { CharacterEntity } from "./character.entity";
import { CompanionTemplateEntity } from "./companion-template.entity";

export type CampaignPartyMemberState = "active" | "roster" | "dismissed";

@Entity("campaign_party_members")
export class CampaignPartyMemberEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Index()
  @Column({ name: "owner_character_id", type: "uuid" })
  ownerCharacterId: string;

  @ManyToOne(() => CharacterEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "owner_character_id" })
  ownerCharacter: CharacterEntity;

  @Index({ unique: true })
  @Column({ name: "companion_character_id", type: "uuid" })
  companionCharacterId: string;

  @ManyToOne(() => CharacterEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companion_character_id" })
  companionCharacter: CharacterEntity;

  @Index()
  @Column({ name: "companion_template_id", type: "uuid" })
  companionTemplateId: string;

  @ManyToOne(() => CompanionTemplateEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "companion_template_id" })
  template: CompanionTemplateEntity;

  @Index()
  @Column({
    type: "enum",
    enum: ["active", "roster", "dismissed"],
    enumName: "campaign_party_member_state_enum",
    default: "roster",
  })
  state: CampaignPartyMemberState;

  @Column({ name: "recruited_at", type: "timestamptz", default: () => "now()" })
  recruitedAt: Date;

  @Column({ name: "last_activated_at", type: "timestamptz", nullable: true })
  lastActivatedAt?: Date | null;

  @Column({ name: "last_deactivated_at", type: "timestamptz", nullable: true })
  lastDeactivatedAt?: Date | null;

  @Column({ name: "dismissed_at", type: "timestamptz", nullable: true })
  dismissedAt?: Date | null;

  @Column({ name: "display_order", type: "int", default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
