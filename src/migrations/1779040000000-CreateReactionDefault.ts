import { MigrationInterface, QueryRunner } from "typeorm";


export class CreateReactionDefault1779040000000 implements MigrationInterface {
  name = "CreateReactionDefault1779040000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS reaction_defaults (
         id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         class_slug             VARCHAR(50) NOT NULL,
         reaction_name          VARCHAR(60) NOT NULL,
         default_state          VARCHAR(10) NOT NULL CHECK (default_state IN ('auto', 'ask', 'off')),
         consumes_spell_slot    BOOLEAN NOT NULL DEFAULT FALSE,
         description            TEXT NULL,
         created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         UNIQUE (class_slug, reaction_name)
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_reaction_defaults_class
         ON reaction_defaults(class_slug)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_reaction_defaults_class`);
    await queryRunner.query(`DROP TABLE IF EXISTS reaction_defaults`);
  }
}
