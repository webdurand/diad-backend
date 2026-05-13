import { MigrationInterface, QueryRunner } from "typeorm";


export class AddDyingStateToParticipant1774900000000 implements MigrationInterface {
  name = "AddDyingStateToParticipant1774900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE encounter_participants
        ADD COLUMN dying_state varchar(16) NOT NULL DEFAULT 'none'
    `);

    await queryRunner.query(`
      ALTER TABLE encounter_participants
        ADD CONSTRAINT chk_dying_state
        CHECK (dying_state IN ('none', 'dying', 'stable', 'dead'))
    `);


    await queryRunner.query(`
      UPDATE encounter_participants
         SET dying_state = 'dying'
       WHERE type = 'pc' AND is_defeated = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE encounter_participants DROP CONSTRAINT IF EXISTS chk_dying_state
    `);
    await queryRunner.query(`
      ALTER TABLE encounter_participants DROP COLUMN dying_state
    `);
  }
}
