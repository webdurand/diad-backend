import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 014 M1 — Narrator voice presets + SPR (System Prompt Repetition).
 *
 * 4 system presets seedados pela migration seguinte:
 *   heroic-high-fantasy, grim-low-fantasy,
 *   investigativo-misterioso, comico-pulp.
 *
 * Cada preset carrega few_shot_examples curados (mín 3, ideal 5-7)
 * e emotional_triggers pra keying em beats narrativos específicos.
 */
export class CreateVoiceProfile1778070000000 implements MigrationInterface {
  name = "CreateVoiceProfile1778070000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS voice_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR NOT NULL UNIQUE,
        core_identity TEXT NOT NULL,
        speech_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
        emotional_triggers JSONB NOT NULL DEFAULT '{}'::jsonb,
        forbidden_tropes JSONB NOT NULL DEFAULT '[]'::jsonb,
        constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
        few_shot_examples JSONB NOT NULL DEFAULT '[]'::jsonb,
        pacing VARCHAR NOT NULL DEFAULT 'medio',
        is_system_preset BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT voice_profiles_pacing_check CHECK (pacing IN
          ('rapido','medio','lento'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_voice_profiles_is_system_preset
         ON voice_profiles(is_system_preset) WHERE is_system_preset = true`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_voice_profiles_is_system_preset`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS voice_profiles`);
  }
}
