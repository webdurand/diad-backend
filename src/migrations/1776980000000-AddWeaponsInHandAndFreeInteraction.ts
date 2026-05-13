import { MigrationInterface, QueryRunner } from "typeorm";


export class AddWeaponsInHandAndFreeInteraction1776980000000 implements MigrationInterface {
  name = "AddWeaponsInHandAndFreeInteraction1776980000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE character_equipment
       ADD COLUMN IF NOT EXISTS main_hand BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await queryRunner.query(
      `ALTER TABLE character_equipment
       ADD COLUMN IF NOT EXISTS off_hand BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS free_object_interactions_used INT NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants DROP COLUMN IF EXISTS free_object_interactions_used`,
    );
    await queryRunner.query(
      `ALTER TABLE character_equipment DROP COLUMN IF EXISTS off_hand`,
    );
    await queryRunner.query(
      `ALTER TABLE character_equipment DROP COLUMN IF EXISTS main_hand`,
    );
  }
}
