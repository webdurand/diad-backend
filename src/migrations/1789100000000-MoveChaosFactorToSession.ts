import { MigrationInterface, QueryRunner } from "typeorm";


export class MoveChaosFactorToSession1789100000000 implements MigrationInterface {
  name = "MoveChaosFactorToSession1789100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE game_sessions
      ADD COLUMN IF NOT EXISTS chaos_factor smallint NOT NULL DEFAULT 5
    `);
    await queryRunner.query(`
      ALTER TABLE campaigns DROP COLUMN IF EXISTS chaos_factor
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS chaos_factor smallint NOT NULL DEFAULT 5
    `);
    await queryRunner.query(`
      ALTER TABLE game_sessions DROP COLUMN IF EXISTS chaos_factor
    `);
  }
}
