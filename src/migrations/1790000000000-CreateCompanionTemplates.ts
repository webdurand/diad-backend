import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCompanionTemplates1790000000000
  implements MigrationInterface
{
  name = "CreateCompanionTemplates1790000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS companion_templates (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        campaign_id uuid NOT NULL,
        name varchar NOT NULL,
        slug varchar NOT NULL,
        race varchar NOT NULL,
        portrait_url varchar,
        personality_big5 jsonb NOT NULL DEFAULT '{}'::jsonb,
        dialogue_style text NOT NULL,
        voice_notes text NOT NULL,
        motivation text NOT NULL,
        companion_profile jsonb,
        suggested_build jsonb,
        introduction_hook jsonb,
        display_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_companion_templates PRIMARY KEY (id),
        CONSTRAINT uq_companion_templates_campaign_slug UNIQUE (campaign_id, slug),
        CONSTRAINT fk_companion_templates_campaign FOREIGN KEY (campaign_id)
          REFERENCES campaigns(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_companion_templates_campaign
      ON companion_templates (campaign_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_companion_templates_campaign_order
      ON companion_templates (campaign_id, display_order, name)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_companion_templates_campaign_order
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_companion_templates_campaign
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS companion_templates`);
  }
}
