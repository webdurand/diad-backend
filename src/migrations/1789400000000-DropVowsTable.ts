import { MigrationInterface, QueryRunner } from "typeorm";


export class DropVowsTable1789400000000 implements MigrationInterface {
  name = "DropVowsTable1789400000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "vows" CASCADE`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vows" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "game_session_id" uuid NOT NULL,
        "description" text NOT NULL,
        "rank" varchar NOT NULL,
        "progress" numeric(4,2) NOT NULL DEFAULT 0,
        "status" varchar NOT NULL DEFAULT 'open',
        "is_main_vow" boolean NOT NULL DEFAULT false,
        "milestone_conditions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "close_roll_result" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "fulfilled_at" timestamptz,
        CONSTRAINT "FK_vows_game_session_id"
          FOREIGN KEY ("game_session_id")
          REFERENCES "game_sessions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_vows_game_session_id" ON "vows"("game_session_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_vows_is_main_vow" ON "vows"("is_main_vow")`,
    );
  }
}
