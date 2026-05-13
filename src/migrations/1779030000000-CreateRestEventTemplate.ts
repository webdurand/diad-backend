import { MigrationInterface, QueryRunner } from "typeorm";


export class CreateRestEventTemplate1779030000000 implements MigrationInterface {
  name = "CreateRestEventTemplate1779030000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS rest_event_templates (
         id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         kind                  VARCHAR(40) NOT NULL CHECK (kind IN (
                                 'npc_dialog_pending',
                                 'dream_foreshadow',
                                 'chekhov_payoff_reminder',
                                 'mythic_random_event',
                                 'hostile_interruption',
                                 'npc_visit_opportunity',
                                 'nothing'
                               )),
         trigger_condition     TEXT NOT NULL,
         weight                INTEGER NOT NULL CHECK (weight >= 0),
         narrative_template_id UUID NULL,
         created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_rest_event_templates_kind
         ON rest_event_templates(kind)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_rest_event_templates_kind`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS rest_event_templates`);
  }
}
