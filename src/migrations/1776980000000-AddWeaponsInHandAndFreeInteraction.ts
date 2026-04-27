import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Premissa RAW 2024 — weapons-in-hand + free object interaction.
 *
 * `character_equipment.main_hand` / `off_hand`: marca qual item está empunhado
 * em qual mão. ActionBar filtra apenas main_hand/off_hand=true. Resto fica no
 * inventário. Validações no service: 2H weapon ocupa ambas, shield vai em off,
 * dual-wield exige ambas com property `light`.
 *
 * `encounter_participants.free_object_interactions_used`: conta quantas free
 * object interactions foram gastas no turno atual (RAW 2024 permite 1 por
 * turno — draw ou stow). Reset em start-turn.
 */
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
