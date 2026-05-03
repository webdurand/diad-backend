import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec NNN — Mundo + Aventura (criação rica + consumo visível).
 *
 * Enriquece tabela campaigns para suportar:
 *   - dm_mode: distinguir mundo solo IA de campanha multi-player com DM humano
 *   - scope: solo (1 char) vs party (multi-char)
 *   - is_draft: wizard cria draft, submit publica (auto-cleanup > 7 dias)
 *   - generation_seed: snapshot do dict usado pra criar a campaign (replay/audit)
 *
 * Política de migração: aventuras (sessions) e mundos (campaigns) solo atuais
 * podem ser dropados antes do deploy — sem necessidade de scripts de
 * migração de dados antigos. Migration apenas adiciona colunas com defaults.
 *
 * Coluna death_handling já existe da migration 1779.
 *
 * Down() simétrico: remove colunas (preservando dados em backup se necessário).
 */
export class EnrichCampaignsForAI1786010000000 implements MigrationInterface {
  name = "EnrichCampaignsForAI1786010000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN IF NOT EXISTS "dm_mode" varchar NOT NULL DEFAULT 'ai'
    `);
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD CONSTRAINT "campaigns_dm_mode_check"
          CHECK ("dm_mode" IN ('ai','human'))
    `);

    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN IF NOT EXISTS "scope" varchar NOT NULL DEFAULT 'solo'
    `);
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD CONSTRAINT "campaigns_scope_check"
          CHECK ("scope" IN ('solo','party'))
    `);

    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN IF NOT EXISTS "is_draft" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN IF NOT EXISTS "generation_seed" jsonb
    `);

    // Índice pra lista paginada de mundos do user (frequente)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_campaigns_dm_user_dm_mode_is_draft"
        ON "campaigns" ("dm_user_id", "dm_mode", "is_draft")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_campaigns_dm_user_dm_mode_is_draft"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "generation_seed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "is_draft"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "campaigns_scope_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "scope"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "campaigns_dm_mode_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "dm_mode"`,
    );
  }
}
