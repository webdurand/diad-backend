import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fighter L9 Indomitable (RAW 2024 XPHB) — player arma preventivamente;
 * próximo save failed é rerolled automaticamente com +fighter_level de bônus.
 * Consome `feature_uses_used['indomitable']` (já existe no character_state).
 * Flag `indomitable_armed` vive só dentro do encounter; reset em desarmar
 * manual, consumo após failed save, OU saída do encontro.
 */
export class AddIndomitableArmedToParticipant1776990000000
  implements MigrationInterface
{
  name = 'AddIndomitableArmedToParticipant1776990000000';

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
