import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 014 M1 — Harmon Story Circle beat tracking por cena.
 *
 * arc_beat ∈ {YOU,NEED,GO,SEARCH,FIND,TAKE,RETURN,CHANGE}, nullable
 * (scenes antigas ficam sem beat; computed apenas em scenes novas).
 */
export class AddSceneArcBeat1778010000000 implements MigrationInterface {
  name = 'AddSceneArcBeat1778010000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE scenes ADD COLUMN IF NOT EXISTS arc_beat VARCHAR(8) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE scenes
       DROP CONSTRAINT IF EXISTS scenes_arc_beat_check,
       ADD CONSTRAINT scenes_arc_beat_check
         CHECK (arc_beat IS NULL OR arc_beat IN
           ('YOU','NEED','GO','SEARCH','FIND','TAKE','RETURN','CHANGE'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_arc_beat_check`,
    );
    await queryRunner.query(
      `ALTER TABLE scenes DROP COLUMN IF EXISTS arc_beat`,
    );
  }
}
