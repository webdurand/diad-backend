import { MigrationInterface, QueryRunner } from "typeorm";

export class ChapterBookendCeremony1790800000000 implements MigrationInterface {
  name = "ChapterBookendCeremony1790800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bookend_artifacts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "game_session_id" uuid NOT NULL,
        "phase_transition_id" uuid NULL,
        "kind" varchar(32) NOT NULL,
        "prose" text NOT NULL,
        "npcs_referenced" uuid[] NOT NULL DEFAULT '{}'::uuid[],
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "skipped_by_user" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_bookend_artifacts_session"
          FOREIGN KEY ("game_session_id") REFERENCES "game_sessions"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_bookend_artifacts_phase_transition"
          FOREIGN KEY ("phase_transition_id") REFERENCES "phase_transitions"("id")
          ON DELETE SET NULL,
        CONSTRAINT "CHK_bookend_artifacts_kind"
          CHECK ("kind" IN ('outro','intro','previously_on'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bookend_artifacts_session_created"
        ON "bookend_artifacts" ("game_session_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bookend_artifacts_phase_transition"
        ON "bookend_artifacts" ("phase_transition_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bookend_artifacts_kind"
        ON "bookend_artifacts" ("kind")
    `);

    await queryRunner.query(`
      ALTER TABLE "phase_transitions"
        ADD COLUMN IF NOT EXISTS "bookend_status" varchar(24) NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS "bookend_payload_snapshot" jsonb NULL
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
          'phase_completed',
          ARRAY['Narrator','Director','HUD','Archivist'],
          FALSE,
          'bookend',
          'Bookend encerra fase: Narrator/Director recebem milestone, HUD anima, Archivist arquiva.'
        ),
        (
          'NarrativeEvent',
          'bookend_ready',
          ARRAY['HUD','Archivist'],
          FALSE,
          'bookend',
          'HUD renderiza vignette e Archivist indexa artefato.'
        ),
        (
          'NarrativeEvent',
          'bookend_failed',
          ARRAY['Director','Archivist','HUD'],
          FALSE,
          'bookend',
          'Falha de grounding ou LLM cai em fallback visível e auditável.'
        ),
        (
          'NarrativeEvent',
          'previously_on_shown',
          ARRAY['HUD','Archivist'],
          FALSE,
          'bookend',
          'HUD marca recap visto e Archivist registra threshold.'
        ),
        (
          'NarrativeEvent',
          'bookend_skipped',
          ARRAY['HUD','Archivist'],
          FALSE,
          'bookend',
          'Jogador pulou a cerimônia; telemetria para timing futuro.'
        )
      ON CONFLICT (event_category, event_type)
      DO UPDATE SET
        default_audiences = EXCLUDED.default_audiences,
        overrideable = EXCLUDED.overrideable,
        sub_channel = EXCLUDED.sub_channel,
        rationale = EXCLUDED.rationale
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM audience_routing
      WHERE event_category = 'NarrativeEvent'
        AND event_type IN (
          'phase_completed',
          'bookend_ready',
          'bookend_failed',
          'previously_on_shown',
          'bookend_skipped'
        )
    `);
    await queryRunner.query(`
      ALTER TABLE "phase_transitions"
        DROP COLUMN IF EXISTS "bookend_payload_snapshot",
        DROP COLUMN IF EXISTS "bookend_status"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookend_artifacts_kind"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookend_artifacts_phase_transition"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookend_artifacts_session_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bookend_artifacts"`);
  }
}
