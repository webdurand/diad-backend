import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 016 M0 — RestSession entity (audit + state delta + event triggered).
 *
 * Persistência completa do rest pra:
 * 1. Auditoria (tracking economy: short rest spam, exhaustion timeline)
 * 2. Memory L4 (sessão pode citar "no rest anterior, sonhou com X")
 * 3. Event picker history (não disparar mesmo evento 2× seguidos)
 *
 * Ver `specs/016-play-shell-foundation/spec.md` §6 e contract `rest-session.json`.
 */
export class CreateRestSession1779020000000 implements MigrationInterface {
  name = 'CreateRestSession1779020000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS rest_sessions (
         id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         campaign_id         UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
         session_id          UUID NULL REFERENCES game_sessions(id) ON DELETE SET NULL,
         character_id        UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
         scene_id_before     UUID NULL,
         scene_id_after      UUID NULL,
         kind                VARCHAR(10) NOT NULL CHECK (kind IN ('short', 'long')),
         started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         ended_at            TIMESTAMPTZ NULL,
         was_interrupted     BOOLEAN NOT NULL DEFAULT FALSE,
         interruption_reason VARCHAR(40) NULL,
         event_triggered     VARCHAR(40) NULL,
         hp_recovered        INTEGER NOT NULL DEFAULT 0,
         hd_spent            JSONB NOT NULL DEFAULT '{}'::jsonb,
         hd_recovered        JSONB NOT NULL DEFAULT '{}'::jsonb,
         slots_recovered     JSONB NOT NULL DEFAULT '{}'::jsonb,
         exhaustion_delta    INTEGER NOT NULL DEFAULT 0,
         features_restored   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_rest_sessions_character_started
         ON rest_sessions(character_id, started_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_rest_sessions_campaign
         ON rest_sessions(campaign_id, started_at DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_rest_sessions_campaign`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_rest_sessions_character_started`);
    await queryRunner.query(`DROP TABLE IF EXISTS rest_sessions`);
  }
}
