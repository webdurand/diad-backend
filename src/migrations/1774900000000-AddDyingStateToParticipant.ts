import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `dying_state` enum column to `encounter_participants`.
 *
 * Semantics:
 *  - `none`   → not dying (HP > 0, or monster dead/never fought death saves)
 *  - `dying`  → PC at 0 HP, rolling death saves
 *  - `stable` → PC at 0 HP, stabilized (3 successes). Turn passes silently.
 *  - `dead`   → PC dead (3 failures or massive damage instakill). Removed from turnOrder.
 *
 * Backfill: PCs with `is_defeated=true` become `dying` (conservative default).
 * Monsters keep `dying_state='none'` (their "death" is is_defeated).
 */
export class AddDyingStateToParticipant1774900000000 implements MigrationInterface {
  name = 'AddDyingStateToParticipant1774900000000';

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

    // Backfill: PCs derrotados (pre-002) entram como 'dying' (DM pode ajustar).
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
