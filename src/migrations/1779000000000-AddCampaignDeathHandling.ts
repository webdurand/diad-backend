import { MigrationInterface, QueryRunner } from "typeorm";


export class AddCampaignDeathHandling1779000000000 implements MigrationInterface {
  name = "AddCampaignDeathHandling1779000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE campaigns
       ADD COLUMN IF NOT EXISTS death_handling VARCHAR(20) NOT NULL DEFAULT 'narrative'
         CHECK (death_handling IN ('narrative', 'hardcore')),
       ADD COLUMN IF NOT EXISTS xp_mode VARCHAR(20) NOT NULL DEFAULT 'rules'
         CHECK (xp_mode IN ('rules', 'milestone', 'hybrid'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE campaigns
       DROP COLUMN IF EXISTS xp_mode,
       DROP COLUMN IF EXISTS death_handling`,
    );
  }
}
