import { MigrationInterface, QueryRunner } from "typeorm";


export class CreateEndingSlide1778060000000 implements MigrationInterface {
  name = "CreateEndingSlide1778060000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ending_slides (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        category VARCHAR NOT NULL,
        subject_type VARCHAR NOT NULL,
        subject_id UUID NULL,
        template_text TEXT NOT NULL,
        conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
        priority SMALLINT NOT NULL DEFAULT 10,
        required_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
        renders_tone VARCHAR NOT NULL DEFAULT 'neutral',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ending_slides_category_check CHECK (category IN
          ('companion','faction','world','personal_arc','npc_major','location_major')),
        CONSTRAINT ending_slides_subject_type_check CHECK (subject_type IN
          ('npc','faction','location','campaign','party')),
        CONSTRAINT ending_slides_tone_check CHECK (renders_tone IN
          ('hopeful','bittersweet','tragic','neutral','triumphant','ambiguous'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ending_slides_campaign_category
         ON ending_slides(campaign_id, category)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ending_slides_campaign_category`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS ending_slides`);
  }
}
