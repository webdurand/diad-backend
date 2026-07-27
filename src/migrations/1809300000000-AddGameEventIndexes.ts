import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGameEventIndexes1809300000000 implements MigrationInterface {
  name = "AddGameEventIndexes1809300000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_game_events_encounter_id"
       ON game_events (encounter_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_game_events_session_sequence"
       ON game_events (session_id, sequence)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_game_events_encounter_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_game_events_session_sequence"`,
    );
  }
}
