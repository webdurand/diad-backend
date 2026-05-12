import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCampaignPartyMembers1790200000000
  implements MigrationInterface
{
  name = "CreateCampaignPartyMembers1790200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'campaign_party_member_state_enum'
        ) THEN
          CREATE TYPE campaign_party_member_state_enum
          AS ENUM ('active', 'roster', 'dismissed');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS campaign_party_members (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        campaign_id uuid NOT NULL,
        owner_character_id uuid NOT NULL,
        companion_character_id uuid NOT NULL,
        companion_template_id uuid NOT NULL,
        state campaign_party_member_state_enum NOT NULL DEFAULT 'roster',
        recruited_at timestamptz NOT NULL DEFAULT now(),
        last_activated_at timestamptz,
        last_deactivated_at timestamptz,
        dismissed_at timestamptz,
        display_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_campaign_party_members PRIMARY KEY (id),
        CONSTRAINT uq_campaign_party_members_companion_character UNIQUE (companion_character_id),
        CONSTRAINT fk_campaign_party_members_campaign FOREIGN KEY (campaign_id)
          REFERENCES campaigns(id) ON DELETE CASCADE,
        CONSTRAINT fk_campaign_party_members_owner_character FOREIGN KEY (owner_character_id)
          REFERENCES characters(id) ON DELETE CASCADE,
        CONSTRAINT fk_campaign_party_members_companion_character FOREIGN KEY (companion_character_id)
          REFERENCES characters(id) ON DELETE CASCADE,
        CONSTRAINT fk_campaign_party_members_template FOREIGN KEY (companion_template_id)
          REFERENCES companion_templates(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_party_members_campaign_owner
      ON campaign_party_members (campaign_id, owner_character_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_party_members_state
      ON campaign_party_members (campaign_id, state)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_party_members_template
      ON campaign_party_members (companion_template_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_campaign_party_members_template
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_campaign_party_members_state
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_campaign_party_members_campaign_owner
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS campaign_party_members`);
    await queryRunner.query(`
      DROP TYPE IF EXISTS campaign_party_member_state_enum
    `);
  }
}
