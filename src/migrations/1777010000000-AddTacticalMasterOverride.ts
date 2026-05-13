import { MigrationInterface, QueryRunner } from "typeorm";


export class AddTacticalMasterOverride1777010000000 implements MigrationInterface {
  name = "AddTacticalMasterOverride1777010000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS tactical_master_override VARCHAR(16) NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants DROP COLUMN IF EXISTS tactical_master_override`,
    );
  }
}
