import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSessionNpcPosture1791200000000 implements MigrationInterface {
  name = "AddSessionNpcPosture1791200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "session_npc_state"
      ADD COLUMN IF NOT EXISTS "posture" varchar NOT NULL DEFAULT 'peaceful'
    `);
    await queryRunner.query(`
      UPDATE "session_npc_state"
      SET "posture" = 'peaceful'
      WHERE "posture" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "session_npc_state"
      ADD CONSTRAINT "CHK_session_npc_state_posture"
      CHECK ("posture" IN ('peaceful', 'uneasy', 'drawing_weapon', 'combat'))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_npc_state_session_posture"
      ON "session_npc_state" ("game_session_id", "posture")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_session_npc_state_session_posture"
    `);
    await queryRunner.query(`
      ALTER TABLE "session_npc_state"
      DROP CONSTRAINT IF EXISTS "CHK_session_npc_state_posture"
    `);
    await queryRunner.query(`
      ALTER TABLE "session_npc_state"
      DROP COLUMN IF EXISTS "posture"
    `);
  }
}
