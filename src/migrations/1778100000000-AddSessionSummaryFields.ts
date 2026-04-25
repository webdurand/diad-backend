import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 014 M2.C — cross-session recap.
 *
 * - summary_text: prosa resumida da sessão (500-800 tokens), gerada por
 *   SessionSummaryService no /finalize. Injetada no prompt da próxima
 *   sessão via previousSessionId.
 * - summary_key_facts: estruturado (NPCs vivos/mortos, locais visitados,
 *   alianças formadas) pra Director consultar sem custo de tokens.
 * - previous_session_id: self-FK; permite trace cross-session da campanha.
 * - ended_at: timestamp do /finalize (não confunde com updated_at).
 */
export class AddSessionSummaryFields1778100000000
  implements MigrationInterface
{
  name = 'AddSessionSummaryFields1778100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE game_sessions
       ADD COLUMN IF NOT EXISTS summary_text TEXT NULL,
       ADD COLUMN IF NOT EXISTS summary_key_facts JSONB NOT NULL DEFAULT '{}'::jsonb,
       ADD COLUMN IF NOT EXISTS previous_session_id UUID NULL
         REFERENCES game_sessions(id) ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_game_sessions_previous
         ON game_sessions(previous_session_id) WHERE previous_session_id IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_game_sessions_previous`);
    await queryRunner.query(
      `ALTER TABLE game_sessions
       DROP COLUMN IF EXISTS ended_at,
       DROP COLUMN IF EXISTS previous_session_id,
       DROP COLUMN IF EXISTS summary_key_facts,
       DROP COLUMN IF EXISTS summary_text`,
    );
  }
}
