import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 012 — Heroic Inspiration em combate.
 *
 * DM concede `character_state.inspiration=true` (já existe), player pode
 * "armar" pra próximo d20 test via `encounter_participant.inspiration_armed`.
 * Quando usa: attack/save/check ganha advantage, ambos flags resetam.
 */
export class AddInspirationArmedToParticipant1776970000000
  implements MigrationInterface
{
  name = 'AddInspirationArmedToParticipant1776970000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS inspiration_armed BOOLEAN NOT NULL DEFAULT FALSE`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants DROP COLUMN IF EXISTS inspiration_armed`,
    );
  }
}
