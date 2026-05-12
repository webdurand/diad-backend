import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateContinuityFacts1789800000000 implements MigrationInterface {
  name = "CreateContinuityFacts1789800000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS continuity_facts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL,
        scene_id uuid NULL,
        fact_type varchar NOT NULL,
        entity_type varchar NULL,
        entity_id uuid NULL,
        entity_name varchar NULL,
        summary text NOT NULL,
        status varchar NOT NULL DEFAULT 'active',
        confidence real NOT NULL DEFAULT 1,
        salience smallint NOT NULL DEFAULT 5,
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        source_turn int NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_continuity_facts_session FOREIGN KEY (session_id)
          REFERENCES game_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_continuity_facts_scene FOREIGN KEY (scene_id)
          REFERENCES scenes(id) ON DELETE SET NULL,
        CONSTRAINT continuity_facts_status_check
          CHECK (status IN ('active','superseded','retracted')),
        CONSTRAINT continuity_facts_entity_type_check
          CHECK (entity_type IS NULL OR entity_type IN
            ('npc','location','quest','faction','party','item')),
        CONSTRAINT continuity_facts_confidence_range
          CHECK (confidence >= 0 AND confidence <= 1),
        CONSTRAINT continuity_facts_salience_range
          CHECK (salience BETWEEN 1 AND 10)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_continuity_facts_session_status_created
      ON continuity_facts (session_id, status, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_continuity_facts_session_entity_status
      ON continuity_facts (session_id, entity_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_continuity_facts_session_type_status
      ON continuity_facts (session_id, fact_type, status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_continuity_facts_session_type_status
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_continuity_facts_session_entity_status
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_continuity_facts_session_status_created
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS continuity_facts`);
  }
}
