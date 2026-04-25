import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 014 M1 — Ironsworn Vow + close-roll mechanic.
 *
 * progress ∈ [0..10] com frações. Ao fulfill, rola 2d10 (challenge dice),
 * compara com floor(progress/2). Momentum ignorado (Ironsworn).
 *   progress ≥ ambos → strong_hit
 *   progress ≥ 1     → weak_hit
 *   progress < ambos → miss
 */
export class CreateVow1778030000000 implements MigrationInterface {
  name = 'CreateVow1778030000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS vows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        rank VARCHAR NOT NULL,
        progress NUMERIC(4,2) NOT NULL DEFAULT 0,
        status VARCHAR NOT NULL DEFAULT 'open',
        is_main_vow BOOLEAN NOT NULL DEFAULT false,
        milestone_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
        close_roll_result JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        fulfilled_at TIMESTAMPTZ NULL,
        CONSTRAINT vows_rank_check CHECK (rank IN
          ('troublesome','dangerous','formidable','extreme','epic')),
        CONSTRAINT vows_status_check CHECK (status IN
          ('open','fulfilled','forsaken')),
        CONSTRAINT vows_progress_range CHECK (progress >= 0 AND progress <= 10)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_vows_campaign_id ON vows(campaign_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_vows_is_main_vow
         ON vows(campaign_id, is_main_vow) WHERE is_main_vow = true`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vows_is_main_vow`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vows_campaign_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS vows`);
  }
}
