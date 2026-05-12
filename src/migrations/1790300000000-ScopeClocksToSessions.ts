import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Clocks de tensão deixam de ser progresso do mundo e viram progresso da
 * aventura. Rows com game_session_id NULL são templates do mundo; rows com
 * game_session_id preenchido são instâncias mutáveis da sessão.
 */
export class ScopeClocksToSessions1790300000000 implements MigrationInterface {
  name = "ScopeClocksToSessions1790300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE clocks
      ADD COLUMN IF NOT EXISTS game_session_id uuid
    `);

    await queryRunner.query(`
      ALTER TABLE clocks
      ADD CONSTRAINT "FK_clocks_game_session_id"
        FOREIGN KEY (game_session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_clocks_game_session_id"
        ON clocks(game_session_id)
    `);

    // Preserva progresso legado na aventura mais recente do mundo e cria uma
    // cópia limpa como template para futuras aventuras.
    await queryRunner.query(`
      CREATE TEMP TABLE tmp_clock_session_backfill AS
      SELECT c.id AS clock_id, latest.id AS game_session_id
        FROM clocks c
        JOIN LATERAL (
          SELECT s.id
            FROM game_sessions s
           WHERE s.campaign_id = c.campaign_id
           ORDER BY s.updated_at DESC, s.created_at DESC
           LIMIT 1
        ) latest ON true
       WHERE c.game_session_id IS NULL
    `);

    await queryRunner.query(`
      INSERT INTO clocks (
        campaign_id,
        game_session_id,
        name,
        segments,
        filled,
        status,
        type,
        visible_to_player,
        on_full_action,
        advance_rules,
        expires_at,
        created_at,
        updated_at
      )
      SELECT
        c.campaign_id,
        NULL,
        c.name,
        c.segments,
        0,
        'active',
        c.type,
        c.visible_to_player,
        c.on_full_action,
        c.advance_rules,
        c.expires_at,
        now(),
        now()
        FROM clocks c
        JOIN tmp_clock_session_backfill b ON b.clock_id = c.id
    `);

    await queryRunner.query(`
      UPDATE clocks c
         SET game_session_id = b.game_session_id
        FROM tmp_clock_session_backfill b
       WHERE c.id = b.clock_id
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS tmp_clock_session_backfill`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM clocks WHERE game_session_id IS NOT NULL`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clocks_game_session_id"`);
    await queryRunner.query(`
      ALTER TABLE clocks DROP CONSTRAINT IF EXISTS "FK_clocks_game_session_id"
    `);
    await queryRunner.query(`
      ALTER TABLE clocks DROP COLUMN IF EXISTS game_session_id
    `);
  }
}
