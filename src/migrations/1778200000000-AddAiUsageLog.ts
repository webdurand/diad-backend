import { MigrationInterface, QueryRunner } from "typeorm";


export class AddAiUsageLog1778200000000 implements MigrationInterface {
  name = "AddAiUsageLog1778200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS ai_usage_logs (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         campaign_id UUID NULL REFERENCES campaigns(id) ON DELETE CASCADE,
         session_id UUID NULL REFERENCES game_sessions(id) ON DELETE SET NULL,
         agent_role VARCHAR(32) NOT NULL,
         model_id VARCHAR(64) NOT NULL,
         input_tokens INT NOT NULL DEFAULT 0,
         output_tokens INT NOT NULL DEFAULT 0,
         cache_creation_tokens INT NOT NULL DEFAULT 0,
         cache_read_tokens INT NOT NULL DEFAULT 0,
         cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
         took_ms INT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_usage_campaign_created
         ON ai_usage_logs(campaign_id, created_at)
         WHERE campaign_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_usage_session_created
         ON ai_usage_logs(session_id, created_at)
         WHERE session_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_usage_role
         ON ai_usage_logs(agent_role)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_usage_role`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ai_usage_session_created`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ai_usage_campaign_created`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS ai_usage_logs`);
  }
}
