import { MigrationInterface, QueryRunner } from "typeorm";


export class AddTransformationAndCasterLink1777200000000 implements MigrationInterface {
  name = "AddTransformationAndCasterLink1777200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS transformation_state jsonb DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS linked_caster_participant_id varchar(36) DEFAULT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_encounter_participants_linked_caster
       ON encounter_participants(linked_caster_participant_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_encounter_participants_linked_caster`,
    );
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       DROP COLUMN IF EXISTS linked_caster_participant_id`,
    );
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       DROP COLUMN IF EXISTS transformation_state`,
    );
  }
}
