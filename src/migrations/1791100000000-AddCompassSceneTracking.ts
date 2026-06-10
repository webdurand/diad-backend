import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompassSceneTracking1791100000000 implements MigrationInterface {
  name = "AddCompassSceneTracking1791100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "game_sessions"
        ADD COLUMN IF NOT EXISTS "last_scene_location_id" uuid,
        ADD COLUMN IF NOT EXISTS "scenes_at_current_location" int NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_game_sessions_last_scene_location_id"
      ON "game_sessions"("last_scene_location_id")
      WHERE "last_scene_location_id" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_game_sessions_last_scene_location_id";`,
    );
    await queryRunner.query(`
      ALTER TABLE "game_sessions"
        DROP COLUMN IF EXISTS "scenes_at_current_location",
        DROP COLUMN IF EXISTS "last_scene_location_id";
    `);
  }
}
