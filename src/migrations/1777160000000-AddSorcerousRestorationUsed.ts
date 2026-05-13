import { MigrationInterface, QueryRunner } from "typeorm";


export class AddSorcerousRestorationUsed1777160000000 implements MigrationInterface {
  name = "AddSorcerousRestorationUsed1777160000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS sorcerous_restoration_used boolean NOT NULL DEFAULT false`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants DROP COLUMN IF EXISTS sorcerous_restoration_used`,
    );
  }
}
