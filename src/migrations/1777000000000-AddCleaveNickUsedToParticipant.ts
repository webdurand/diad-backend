import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Weapon Mastery Tier B (RAW 2024) — tracking per-turn:
 *  - Cleave: bonus damage num alvo adjacente ao primário. 1× por turno.
 *  - Nick: light weapon extra attack dentro da Attack action. 1× por turno.
 *
 * Ambas flags resetam em start-turn. Usa participant pra ser runtime-only
 * (não persistir entre encontros).
 */
export class AddCleaveNickUsedToParticipant1777000000000
  implements MigrationInterface
{
  name = 'AddCleaveNickUsedToParticipant1777000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS cleave_used_this_turn BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS nick_used_this_turn BOOLEAN NOT NULL DEFAULT FALSE`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants DROP COLUMN IF EXISTS nick_used_this_turn`,
    );
    await queryRunner.query(
      `ALTER TABLE encounter_participants DROP COLUMN IF EXISTS cleave_used_this_turn`,
    );
  }
}
