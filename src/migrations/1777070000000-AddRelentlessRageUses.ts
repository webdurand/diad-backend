import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 012 Barbarian 100% — campo `relentless_rage_uses_used` em
 * encounter_participants pra trackear quantas vezes Relentless Rage foi usado
 * desde o último long rest. DC escala: 10 + 5×uses.
 */
export class AddRelentlessRageUses1777070000000 implements MigrationInterface {
  name = "AddRelentlessRageUses1777070000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS relentless_rage_uses_used integer NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants DROP COLUMN IF EXISTS relentless_rage_uses_used`,
    );
  }
}
