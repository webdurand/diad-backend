import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCampaignStartingLocationId1783000000000
  implements MigrationInterface
{
  name = "AddCampaignStartingLocationId1783000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS starting_location_id UUID NULL
        REFERENCES locations(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_campaigns_starting_location_id
      ON campaigns(starting_location_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_campaigns_starting_location_id
    `);
    await queryRunner.query(`
      ALTER TABLE campaigns DROP COLUMN IF EXISTS starting_location_id
    `);
  }
}
