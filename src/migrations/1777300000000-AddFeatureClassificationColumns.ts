import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 015 Eixo 1 — enriquecimento do FeatureBlock (Princípio X: AI-Legible Mechanics).
 *
 * 6 colunas em `features` que permitem ao sheet + ActionBar + aba Traços
 * exibir cada feature com semântica rica, sem heurística no frontend:
 *
 * - `category` ∈ {active, passive, capstone, resource} — classificação UX.
 * - `display_text` — texto renderizado da `description` JSONB (legível, ≤ 400 chars).
 * - `narrative_descriptor` — frase curta (≤120 chars) pro card/tooltip.
 * - `tactical_value` — int 0-10 opcional pra AI DM/rankings.
 * - `resource_charges` — jsonb {current?, max, formula?} pro chip N/M.
 * - `recharge_rule` ∈ {short, long, turn, none} — quando recarrega a resource.
 *
 * Populadas via seed idempotente (`SeedFeatureCategoryOverrides`).
 * Fallback continua em `classifyFeatureForActions` (regex) quando NULL.
 */
export class AddFeatureClassificationColumns1777300000000 implements MigrationInterface {
  name = "AddFeatureClassificationColumns1777300000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE features
       ADD COLUMN IF NOT EXISTS category VARCHAR(16) NULL,
       ADD COLUMN IF NOT EXISTS display_text TEXT NULL,
       ADD COLUMN IF NOT EXISTS narrative_descriptor VARCHAR(120) NULL,
       ADD COLUMN IF NOT EXISTS tactical_value SMALLINT NULL,
       ADD COLUMN IF NOT EXISTS resource_charges JSONB NULL,
       ADD COLUMN IF NOT EXISTS recharge_rule VARCHAR(16) NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE features
       DROP CONSTRAINT IF EXISTS features_category_check,
       ADD CONSTRAINT features_category_check
         CHECK (category IS NULL OR category IN ('active','passive','capstone','resource'))`,
    );

    await queryRunner.query(
      `ALTER TABLE features
       DROP CONSTRAINT IF EXISTS features_recharge_check,
       ADD CONSTRAINT features_recharge_check
         CHECK (recharge_rule IS NULL OR recharge_rule IN ('short','long','turn','none'))`,
    );

    await queryRunner.query(
      `ALTER TABLE features
       DROP CONSTRAINT IF EXISTS features_tactical_value_range,
       ADD CONSTRAINT features_tactical_value_range
         CHECK (tactical_value IS NULL OR (tactical_value BETWEEN 0 AND 10))`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_features_category ON features(category)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_features_category`);
    await queryRunner.query(
      `ALTER TABLE features
       DROP CONSTRAINT IF EXISTS features_tactical_value_range,
       DROP CONSTRAINT IF EXISTS features_recharge_check,
       DROP CONSTRAINT IF EXISTS features_category_check`,
    );
    await queryRunner.query(
      `ALTER TABLE features
       DROP COLUMN IF EXISTS recharge_rule,
       DROP COLUMN IF EXISTS resource_charges,
       DROP COLUMN IF EXISTS tactical_value,
       DROP COLUMN IF EXISTS narrative_descriptor,
       DROP COLUMN IF EXISTS display_text,
       DROP COLUMN IF EXISTS category`,
    );
  }
}
