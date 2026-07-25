import { MigrationInterface, QueryRunner } from "typeorm";

export class SeparateBonusUnarmedAttacks1809200000000
  implements MigrationInterface
{
  name = "SeparateBonusUnarmedAttacks1809200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS bonus_unarmed_attacks_remaining_this_turn
       INT NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       DROP COLUMN IF EXISTS bonus_unarmed_attacks_remaining_this_turn`,
    );
  }
}
