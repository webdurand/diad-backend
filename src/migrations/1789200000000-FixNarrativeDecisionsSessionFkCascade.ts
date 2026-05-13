import { MigrationInterface, QueryRunner } from "typeorm";


export class FixNarrativeDecisionsSessionFkCascade1789200000000 implements MigrationInterface {
  name = "FixNarrativeDecisionsSessionFkCascade1789200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE fk_name text;
      BEGIN
        SELECT conname INTO fk_name
        FROM pg_constraint
        WHERE conrelid = 'narrative_decisions'::regclass
          AND contype = 'f'
          AND conkey = ARRAY[
            (SELECT attnum FROM pg_attribute
             WHERE attrelid = 'narrative_decisions'::regclass
               AND attname = 'session_id')
          ]::int2[];
        IF fk_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE narrative_decisions DROP CONSTRAINT %I', fk_name);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE narrative_decisions
        ADD CONSTRAINT "FK_narrative_decisions_session_id"
        FOREIGN KEY (session_id) REFERENCES game_sessions(id)
        ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE narrative_decisions
        DROP CONSTRAINT IF EXISTS "FK_narrative_decisions_session_id"
    `);
    await queryRunner.query(`
      ALTER TABLE narrative_decisions
        ADD CONSTRAINT "FK_narrative_decisions_session_id"
        FOREIGN KEY (session_id) REFERENCES game_sessions(id)
        ON DELETE SET NULL
    `);
  }
}
