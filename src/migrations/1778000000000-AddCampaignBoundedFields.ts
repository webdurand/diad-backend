import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 014 M1 — Bounded World + Closure Mechanics.
 *
 * Adiciona 10 colunas em `campaigns` que formalizam os pilares:
 * - P1 Bounded World: contentBudget + currentCounts (atomic UPDATE guards)
 * - P4 Closure: centralQuestion, arcState (Harmon Story Circle tracking)
 * - Tone: dmPersonality, tonalAnchor, chaosFactor (Mythic GME 1-9)
 */
export class AddCampaignBoundedFields1778000000000 implements MigrationInterface {
  name = "AddCampaignBoundedFields1778000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE campaigns
       ADD COLUMN IF NOT EXISTS content_budget JSONB NOT NULL
         DEFAULT '{"maxScenes":12,"maxNpcs":7,"maxLocations":6}'::jsonb,
       ADD COLUMN IF NOT EXISTS current_counts JSONB NOT NULL
         DEFAULT '{"scenes":0,"npcs":0,"locations":0}'::jsonb,
       ADD COLUMN IF NOT EXISTS dm_personality JSONB NOT NULL DEFAULT '{}'::jsonb,
       ADD COLUMN IF NOT EXISTS chaos_factor SMALLINT NOT NULL DEFAULT 5,
       ADD COLUMN IF NOT EXISTS tonal_anchor JSONB NOT NULL DEFAULT '{}'::jsonb,
       ADD COLUMN IF NOT EXISTS central_question TEXT NULL,
       ADD COLUMN IF NOT EXISTS question_stated_at_scene INT NULL,
       ADD COLUMN IF NOT EXISTS question_answered BOOLEAN NOT NULL DEFAULT false,
       ADD COLUMN IF NOT EXISTS question_answer TEXT NULL,
       ADD COLUMN IF NOT EXISTS arc_state JSONB NOT NULL
         DEFAULT '{"currentBeat":"YOU","beatEnteredAtScene":1,"transitionHistory":[]}'::jsonb`,
    );

    await queryRunner.query(
      `ALTER TABLE campaigns
       DROP CONSTRAINT IF EXISTS campaigns_chaos_factor_range,
       ADD CONSTRAINT campaigns_chaos_factor_range
         CHECK (chaos_factor BETWEEN 1 AND 9)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE campaigns
       DROP CONSTRAINT IF EXISTS campaigns_chaos_factor_range`,
    );
    await queryRunner.query(
      `ALTER TABLE campaigns
       DROP COLUMN IF EXISTS arc_state,
       DROP COLUMN IF EXISTS question_answer,
       DROP COLUMN IF EXISTS question_answered,
       DROP COLUMN IF EXISTS question_stated_at_scene,
       DROP COLUMN IF EXISTS central_question,
       DROP COLUMN IF EXISTS tonal_anchor,
       DROP COLUMN IF EXISTS chaos_factor,
       DROP COLUMN IF EXISTS dm_personality,
       DROP COLUMN IF EXISTS current_counts,
       DROP COLUMN IF EXISTS content_budget`,
    );
  }
}
