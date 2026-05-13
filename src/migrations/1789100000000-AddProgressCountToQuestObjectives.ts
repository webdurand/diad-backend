import { MigrationInterface, QueryRunner } from "typeorm";


export class AddProgressCountToQuestObjectives1789100000000 implements MigrationInterface {
  name = "AddProgressCountToQuestObjectives1789100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quest_objectives
      ADD COLUMN IF NOT EXISTS progress_count int NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quest_objectives
      DROP COLUMN IF EXISTS progress_count
    `);
  }
}
