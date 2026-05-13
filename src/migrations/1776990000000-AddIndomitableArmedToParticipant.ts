import { MigrationInterface, QueryRunner } from "typeorm";


export class AddIndomitableArmedToParticipant1776990000000 implements MigrationInterface {
  name = "AddIndomitableArmedToParticipant1776990000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS indomitable_armed BOOLEAN NOT NULL DEFAULT FALSE`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants DROP COLUMN IF EXISTS indomitable_armed`,
    );
  }
}
