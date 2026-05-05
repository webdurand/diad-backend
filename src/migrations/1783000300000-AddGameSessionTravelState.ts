import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGameSessionTravelState1783000300000
  implements MigrationInterface
{
  name = "AddGameSessionTravelState1783000300000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE game_sessions
      ADD COLUMN IF NOT EXISTS travel_state JSONB NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE game_sessions DROP COLUMN IF EXISTS travel_state
    `);
  }
}
