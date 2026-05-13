import { MigrationInterface, QueryRunner } from "typeorm";


export class EnrichQuestsForRevealAndTriggers1788000000000 implements MigrationInterface {
  name = "EnrichQuestsForRevealAndTriggers1788000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quests
      ADD COLUMN IF NOT EXISTS is_main_quest boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS trigger_npc_name varchar,
      ADD COLUMN IF NOT EXISTS trigger_location_name varchar,
      ADD COLUMN IF NOT EXISTS activation_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS revealed_at timestamptz,
      ADD COLUMN IF NOT EXISTS discovered_at timestamptz,
      ADD COLUMN IF NOT EXISTS reveal_evidence text
    `);


    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_quests_main_per_campaign
      ON quests (campaign_id) WHERE is_main_quest = true
    `);

    await queryRunner.query(`
      ALTER TABLE quest_objectives
      ADD COLUMN IF NOT EXISTS advance_evidence text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_quests_main_per_campaign
    `);
    await queryRunner.query(`
      ALTER TABLE quests
      DROP COLUMN IF EXISTS is_main_quest,
      DROP COLUMN IF EXISTS trigger_npc_name,
      DROP COLUMN IF EXISTS trigger_location_name,
      DROP COLUMN IF EXISTS activation_keys,
      DROP COLUMN IF EXISTS revealed_at,
      DROP COLUMN IF EXISTS discovered_at,
      DROP COLUMN IF EXISTS reveal_evidence
    `);
    await queryRunner.query(`
      ALTER TABLE quest_objectives
      DROP COLUMN IF EXISTS advance_evidence
    `);
  }
}
