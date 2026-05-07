import { MigrationInterface, QueryRunner } from "typeorm";

export class ExtendAiUsageLogsForAdminMetrics1783000000000
  implements MigrationInterface
{
  name = "ExtendAiUsageLogsForAdminMetrics1783000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ai_usage_logs
        ADD COLUMN IF NOT EXISTS feature_name VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS character_id UUID NULL,
        ADD COLUMN IF NOT EXISTS scene_type VARCHAR(32) NULL,
        ADD COLUMN IF NOT EXISTS turn_number INT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_feature_created
        ON ai_usage_logs(feature_name, created_at)
        WHERE feature_name IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_character_created
        ON ai_usage_logs(character_id, created_at)
        WHERE character_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_model_created
        ON ai_usage_logs(model_id, created_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_usage_model_created`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ai_usage_character_created`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ai_usage_feature_created`,
    );
    await queryRunner.query(`
      ALTER TABLE ai_usage_logs
        DROP COLUMN IF EXISTS turn_number,
        DROP COLUMN IF EXISTS scene_type,
        DROP COLUMN IF EXISTS character_id,
        DROP COLUMN IF EXISTS feature_name
    `);
  }
}
