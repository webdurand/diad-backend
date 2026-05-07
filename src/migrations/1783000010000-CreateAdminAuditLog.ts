import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAdminAuditLog1783000010000 implements MigrationInterface {
  name = "CreateAdminAuditLog1783000010000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action VARCHAR(64) NOT NULL,
        target_entity VARCHAR(64) NULL,
        target_id VARCHAR(128) NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        trace_id VARCHAR(32) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_created
        ON admin_audit_log(admin_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_audit_action_created
        ON admin_audit_log(action, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_audit_trace
        ON admin_audit_log(trace_id)
        WHERE trace_id IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_admin_audit_trace`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_admin_audit_action_created`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_admin_audit_admin_created`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS admin_audit_log`);
  }
}
