import { MigrationInterface, QueryRunner } from "typeorm";

export class BimodalNarrativeLoop1790700000000 implements MigrationInterface {
  name = "BimodalNarrativeLoop1790700000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE scenes
      ADD COLUMN IF NOT EXISTS social_collective boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS meta_query_audit (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        session_id uuid NOT NULL,
        scene_id uuid NOT NULL,
        character_id uuid NULL,
        question_hash char(64) NOT NULL,
        intent_category varchar(32) NOT NULL,
        filtered_facts_count int NOT NULL DEFAULT 0,
        trace_id varchar(32) NULL,
        answer_summary text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_meta_query_audit PRIMARY KEY (id),
        CONSTRAINT fk_meta_query_audit_session FOREIGN KEY (session_id)
          REFERENCES game_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_meta_query_audit_scene FOREIGN KEY (scene_id)
          REFERENCES scenes(id) ON DELETE CASCADE,
        CONSTRAINT fk_meta_query_audit_character FOREIGN KEY (character_id)
          REFERENCES characters(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_meta_query_audit_session_scene
      ON meta_query_audit (session_id, scene_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_meta_query_audit_character_scene
      ON meta_query_audit (character_id, scene_id)
    `);

    await queryRunner.query(`
      INSERT INTO audience_routing (
        event_category,
        event_type,
        default_audiences,
        overrideable,
        sub_channel,
        rationale
      )
      VALUES
        (
          'NarrativeEvent',
          'dialogue_started',
          ARRAY['Narrator','Director','HUD','Archivist'],
          FALSE,
          'dialogue',
          'Diálogo iniciado altera modo de cena, HUD, lock de movimento e memória narrativa.'
        ),
        (
          'NarrativeEvent',
          'dialogue_exited',
          ARRAY['Narrator','Director','HUD','Archivist'],
          FALSE,
          'dialogue',
          'Saída de diálogo libera o loop aberto e deve ser vista por narrador, HUD e archivist.'
        ),
        (
          'NarrativeEvent',
          'dialogue_focal_swapped',
          ARRAY['Narrator','Director','HUD','Archivist'],
          FALSE,
          'dialogue',
          'Troca focal em diálogo coletivo ajusta interlocutor e preserva continuidade social.'
        ),
        (
          'NarrativeEvent',
          'meta_query_invoked',
          ARRAY['Narrator','Director','HUD','Archivist'],
          FALSE,
          'meta-query',
          'Perguntas meta afetam orçamento de cena, UX e auditoria sem expor texto cru.'
        )
      ON CONFLICT (event_category, event_type)
      DO UPDATE SET
        default_audiences = EXCLUDED.default_audiences,
        overrideable = EXCLUDED.overrideable,
        sub_channel = EXCLUDED.sub_channel,
        rationale = EXCLUDED.rationale
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM audience_routing
      WHERE event_category = 'NarrativeEvent'
        AND event_type IN (
          'dialogue_started',
          'dialogue_exited',
          'dialogue_focal_swapped',
          'meta_query_invoked'
        )
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_meta_query_audit_character_scene
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_meta_query_audit_session_scene
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS meta_query_audit`);
    await queryRunner.query(`
      ALTER TABLE scenes
      DROP COLUMN IF EXISTS social_collective
    `);
  }
}
