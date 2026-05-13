import { MigrationInterface, QueryRunner } from "typeorm";


export class AddSorceryPointsUsed1777140000000 implements MigrationInterface {
  name = "AddSorceryPointsUsed1777140000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS sorcery_points_used integer NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants DROP COLUMN IF EXISTS sorcery_points_used`,
    );
  }
}
