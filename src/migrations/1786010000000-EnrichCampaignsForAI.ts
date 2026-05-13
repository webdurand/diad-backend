import { MigrationInterface, QueryRunner } from "typeorm";


export class EnrichCampaignsForAI1786010000000 implements MigrationInterface {
  name = "EnrichCampaignsForAI1786010000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN IF NOT EXISTS "dm_mode" varchar NOT NULL DEFAULT 'ai'
    `);
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD CONSTRAINT "campaigns_dm_mode_check"
          CHECK ("dm_mode" IN ('ai','human'))
    `);

    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN IF NOT EXISTS "scope" varchar NOT NULL DEFAULT 'solo'
    `);
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD CONSTRAINT "campaigns_scope_check"
          CHECK ("scope" IN ('solo','party'))
    `);

    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN IF NOT EXISTS "is_draft" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN IF NOT EXISTS "generation_seed" jsonb
    `);


    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_campaigns_dm_user_dm_mode_is_draft"
        ON "campaigns" ("dm_user_id", "dm_mode", "is_draft")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_campaigns_dm_user_dm_mode_is_draft"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "generation_seed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "is_draft"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "campaigns_scope_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "scope"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "campaigns_dm_mode_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "dm_mode"`,
    );
  }
}
