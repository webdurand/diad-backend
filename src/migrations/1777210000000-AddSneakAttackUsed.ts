import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 012 Sprint F — Rogue Sneak Attack flag. 1/turn damage rider, resetado
 * em start-turn. Dice scale by classLevel (Nd6 — 1d6 L1 ... 10d6 L19).
 */
export class AddSneakAttackUsed1777210000000 implements MigrationInterface {
  name = 'AddSneakAttackUsed1777210000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS sneak_attack_used_this_turn boolean NOT NULL DEFAULT false`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       DROP COLUMN IF EXISTS sneak_attack_used_this_turn`,
    );
  }
}
