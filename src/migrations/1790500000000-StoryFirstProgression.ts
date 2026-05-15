import { MigrationInterface, QueryRunner } from "typeorm";

export class StoryFirstProgression1790500000000
  implements MigrationInterface
{
  name = "StoryFirstProgression1790500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "phases" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "story_arc_id" uuid NOT NULL,
        "index" smallint NOT NULL,
        "name" varchar(60) NOT NULL,
        "description" text NULL,
        "emotional_arc" varchar(32) NOT NULL,
        "arc_beats" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "unlock_conditions" jsonb NOT NULL DEFAULT '{"any":[]}'::jsonb,
        "completion_conditions" jsonb NOT NULL DEFAULT '{"any":[]}'::jsonb,
        "transition_beat_narrative_seed" text NULL,
        "deprecates_on_advance" jsonb NOT NULL DEFAULT '{"lostObjectives":[],"migratingNpcs":[],"deprecatedPois":[]}'::jsonb,
        "is_reversible" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_phases_story_arc_index" UNIQUE ("story_arc_id", "index"),
        CONSTRAINT "FK_phases_story_arc"
          FOREIGN KEY ("story_arc_id") REFERENCES "story_arcs"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_phases_story_arc"
        ON "phases" ("story_arc_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "phase_transitions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "game_session_id" uuid NOT NULL,
        "story_arc_id" uuid NOT NULL,
        "from_phase_index" smallint NOT NULL,
        "to_phase_index" smallint NOT NULL,
        "transition_beat_narrative_seed" text NULL,
        "confirmed_by_user_id" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_phase_transitions_session"
          FOREIGN KEY ("game_session_id") REFERENCES "game_sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_phase_transitions_story_arc"
          FOREIGN KEY ("story_arc_id") REFERENCES "story_arcs"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_phase_transitions_session"
        ON "phase_transitions" ("game_session_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_phase_transitions_story_arc"
        ON "phase_transitions" ("story_arc_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "session_story_arc_state"
        ADD COLUMN IF NOT EXISTS "current_phase_index" smallint NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      ALTER TABLE "game_sessions"
        ADD COLUMN IF NOT EXISTS "turns_since_mission_progress" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "pull_score" double precision NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "quest_objectives"
        ADD COLUMN IF NOT EXISTS "priority" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "last_narrative_descriptor" varchar(240) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "location_pois"
        ADD COLUMN IF NOT EXISTS "kind" varchar(24) NOT NULL DEFAULT 'wild',
        ADD COLUMN IF NOT EXISTS "phase_index" smallint NULL,
        ADD COLUMN IF NOT EXISTS "narrative_role" varchar NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "location_connections"
        ADD COLUMN IF NOT EXISTS "unlocked_at_phase" smallint NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "npcs"
        ADD COLUMN IF NOT EXISTS "phase_index" smallint NULL,
        ADD COLUMN IF NOT EXISTS "narrative_role" varchar NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "npcs"
        DROP COLUMN IF EXISTS "narrative_role",
        DROP COLUMN IF EXISTS "phase_index"
    `);
    await queryRunner.query(`
      ALTER TABLE "location_connections"
        DROP COLUMN IF EXISTS "unlocked_at_phase"
    `);
    await queryRunner.query(`
      ALTER TABLE "location_pois"
        DROP COLUMN IF EXISTS "narrative_role",
        DROP COLUMN IF EXISTS "phase_index",
        DROP COLUMN IF EXISTS "kind"
    `);
    await queryRunner.query(`
      ALTER TABLE "quest_objectives"
        DROP COLUMN IF EXISTS "last_narrative_descriptor",
        DROP COLUMN IF EXISTS "priority"
    `);
    await queryRunner.query(`
      ALTER TABLE "game_sessions"
        DROP COLUMN IF EXISTS "pull_score",
        DROP COLUMN IF EXISTS "turns_since_mission_progress"
    `);
    await queryRunner.query(`
      ALTER TABLE "session_story_arc_state"
        DROP COLUMN IF EXISTS "current_phase_index"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_phase_transitions_story_arc"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_phase_transitions_session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "phase_transitions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_phases_story_arc"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "phases"`);
  }
}
