import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCampaignIsSandbox1789600000000 implements MigrationInterface {
  name = "AddCampaignIsSandbox1789600000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE campaigns
       ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_campaigns_dm_user_id_is_sandbox
       ON campaigns (dm_user_id, is_sandbox) WHERE is_sandbox = true`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_campaigns_dm_user_id_is_sandbox`,
    );
    await queryRunner.query(
      `ALTER TABLE campaigns DROP COLUMN IF EXISTS is_sandbox`,
    );
  }
}
