import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 014 M1 — Blades in the Dark progress clocks.
 *
 * Uma Main Clock por campanha (visível) + 2-4 secondary (threat/opportunity).
 * Quando filled == segments, on_full_action dispara evento via EventLogService.
 */
export class CreateClock1778020000000 implements MigrationInterface {
  name = 'CreateClock1778020000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS clocks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        segments INT NOT NULL,
        filled INT NOT NULL DEFAULT 0,
        type VARCHAR NOT NULL DEFAULT 'threat',
        visible_to_player BOOLEAN NOT NULL DEFAULT true,
        on_full_action JSONB NOT NULL DEFAULT '{}'::jsonb,
        advance_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NULL,
        CONSTRAINT clocks_segments_positive CHECK (segments > 0),
        CONSTRAINT clocks_filled_range CHECK (filled >= 0 AND filled <= segments),
        CONSTRAINT clocks_type_check CHECK (type IN ('main','threat','opportunity'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_clocks_campaign_id ON clocks(campaign_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_clocks_campaign_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS clocks`);
  }
}
