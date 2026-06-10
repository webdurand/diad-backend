import { MigrationInterface, QueryRunner } from "typeorm";

export class NarrativeMemoryIdentity1791000000000 implements MigrationInterface {
  name = "NarrativeMemoryIdentity1791000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "characters"
        ADD COLUMN IF NOT EXISTS "current_identity_tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS "identity_tags_history" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "phases"
        ADD COLUMN IF NOT EXISTS "bond_history" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_chronicles"
        ADD COLUMN IF NOT EXISTS "phase_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "phase_index" smallint NULL,
        ADD COLUMN IF NOT EXISTS "tier" varchar(16) NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS "legacy_tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS "tier_locked" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "tiered_at" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "summarizer_metadata" jsonb NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_campaign_chronicles_phase'
        ) THEN
          ALTER TABLE "campaign_chronicles"
            ADD CONSTRAINT "FK_campaign_chronicles_phase"
            FOREIGN KEY ("phase_id") REFERENCES "phases"("id")
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_campaign_chronicles_tier"
        ON "campaign_chronicles" ("tier")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_campaign_chronicles_phase_index"
        ON "campaign_chronicles" ("phase_index")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "downtime_turns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "game_session_id" uuid NOT NULL,
        "phase_transition_id" uuid NOT NULL,
        "turn_index" smallint NOT NULL,
        "archetype_chosen" varchar(24) NOT NULL,
        "chaos_factor" smallint NOT NULL,
        "narrative_text" text NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'ready',
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_downtime_turns" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_downtime_turns_transition_turn"
          UNIQUE ("phase_transition_id", "turn_index"),
        CONSTRAINT "FK_downtime_turns_session"
          FOREIGN KEY ("game_session_id") REFERENCES "game_sessions"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_downtime_turns_phase_transition"
          FOREIGN KEY ("phase_transition_id") REFERENCES "phase_transitions"("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_downtime_turns_session"
        ON "downtime_turns" ("game_session_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_downtime_turns_phase_transition"
        ON "downtime_turns" ("phase_transition_id")
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
          'identity_tags_changed',
          ARRAY['Narrator','HUD','Archivist'],
          FALSE,
          'narrative_memory',
          'Identity tags alteram prompt de persona, HUD e audit.'
        ),
        (
          'NarrativeEvent',
          'chronicle_tier_changed',
          ARRAY['Archivist'],
          FALSE,
          'narrative_memory',
          'Tiering de memória longa evita context rot e preserva audit.'
        ),
        (
          'NarrativeEvent',
          'downtime_executed',
          ARRAY['Narrator','Director','HUD'],
          FALSE,
          'narrative_memory',
          'Downtime vira flashback opcional e ajusta abertura da próxima fase.'
        ),
        (
          'NarrativeEvent',
          'nl_trigger_evaluated',
          ARRAY['Director','Archivist'],
          FALSE,
          'narrative_memory',
          'Auditor NL registra evidence e satisfaction dos completion gates.'
        ),
        (
          'WorldEvent',
          'chaos_factor_evolved',
          ARRAY['Director','HUD'],
          FALSE,
          'narrative_memory',
          'Outcome de fase evolui Chaos Factor deterministicamente.'
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
      WHERE (event_category, event_type) IN (
        ('NarrativeEvent', 'identity_tags_changed'),
        ('NarrativeEvent', 'chronicle_tier_changed'),
        ('NarrativeEvent', 'downtime_executed'),
        ('NarrativeEvent', 'nl_trigger_evaluated'),
        ('WorldEvent', 'chaos_factor_evolved')
      )
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "downtime_turns"`);
    await queryRunner.query(`
      ALTER TABLE "campaign_chronicles"
        DROP CONSTRAINT IF EXISTS "FK_campaign_chronicles_phase",
        DROP COLUMN IF EXISTS "summarizer_metadata",
        DROP COLUMN IF EXISTS "tiered_at",
        DROP COLUMN IF EXISTS "tier_locked",
        DROP COLUMN IF EXISTS "legacy_tags",
        DROP COLUMN IF EXISTS "tier",
        DROP COLUMN IF EXISTS "phase_index",
        DROP COLUMN IF EXISTS "phase_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "phases"
        DROP COLUMN IF EXISTS "bond_history"
    `);
    await queryRunner.query(`
      ALTER TABLE "characters"
        DROP COLUMN IF EXISTS "identity_tags_history",
        DROP COLUMN IF EXISTS "current_identity_tags"
    `);
  }
}
