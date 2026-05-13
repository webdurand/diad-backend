import { MigrationInterface, QueryRunner } from "typeorm";


export class AddSuperiorityDicePool1777030000000 implements MigrationInterface {
  name = "AddSuperiorityDicePool1777030000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS superiority_dice_used INT NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants DROP COLUMN IF EXISTS superiority_dice_used`,
    );
  }
}
