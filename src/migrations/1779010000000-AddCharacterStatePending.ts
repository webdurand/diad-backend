import { MigrationInterface, QueryRunner } from "typeorm";


export class AddCharacterStatePending1779010000000 implements MigrationInterface {
  name = "AddCharacterStatePending1779010000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE character_state
       ADD COLUMN IF NOT EXISTS pending_level_up JSONB NULL,
       ADD COLUMN IF NOT EXISTS reaction_prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
       ADD COLUMN IF NOT EXISTS last_long_rest_at TIMESTAMPTZ NULL,
       ADD COLUMN IF NOT EXISTS last_short_rest_at TIMESTAMPTZ NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE character_state
       DROP COLUMN IF EXISTS last_short_rest_at,
       DROP COLUMN IF EXISTS last_long_rest_at,
       DROP COLUMN IF EXISTS reaction_prefs,
       DROP COLUMN IF EXISTS pending_level_up`,
    );
  }
}
