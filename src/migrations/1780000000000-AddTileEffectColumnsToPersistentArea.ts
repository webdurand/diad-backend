import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 013 — Ground Effects.
 *
 * Aditiva: 7 colunas novas em `persistent_area_effects`. Nullable pra preservar
 * registros legacy (Spirit Guardians, Wall of Fire, Cloud of Daggers, Moonbeam
 * criados pré-013 via Spec 004). Quando `effect_kind` IS NULL, o resolver usa
 * o path legado `tickDamageFor`. Quando setado, usa `triggers[]` (Strategy).
 *
 * Princípio X (Constitution): `tactical_metadata` (camada 2) +
 * `narrative_descriptor` (camada 3) tornam a feature consumível por AI DM.
 */
export class AddTileEffectColumnsToPersistentArea1780000000000 implements MigrationInterface {
  name = "AddTileEffectColumnsToPersistentArea1780000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "persistent_area_effects"
      ADD COLUMN IF NOT EXISTS "effect_kind" varchar(32) NULL,
      ADD COLUMN IF NOT EXISTS "triggers" jsonb NULL,
      ADD COLUMN IF NOT EXISTS "is_difficult_terrain" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "speed_multiplier" real NULL,
      ADD COLUMN IF NOT EXISTS "tactical_metadata" jsonb NULL,
      ADD COLUMN IF NOT EXISTS "narrative_descriptor" varchar(120) NULL,
      ADD COLUMN IF NOT EXISTS "slot_level" int NULL,
      ADD COLUMN IF NOT EXISTS "aura_follows_caster" boolean NOT NULL DEFAULT false
    `);

    // Backfill Spirit Guardians legacy: marca aura_follows_caster=true.
    // Critério: source_spell='spirit-guardians' (mantém compat com código
    // pre-013 que setava `relocateAurasByCaster` via Set hardcoded).
    await queryRunner.query(`
      UPDATE "persistent_area_effects"
      SET "aura_follows_caster" = true
      WHERE "source_spell" = 'spirit-guardians'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "persistent_area_effects"
      DROP COLUMN IF EXISTS "aura_follows_caster",
      DROP COLUMN IF EXISTS "slot_level",
      DROP COLUMN IF EXISTS "narrative_descriptor",
      DROP COLUMN IF EXISTS "tactical_metadata",
      DROP COLUMN IF EXISTS "speed_multiplier",
      DROP COLUMN IF EXISTS "is_difficult_terrain",
      DROP COLUMN IF EXISTS "triggers",
      DROP COLUMN IF EXISTS "effect_kind"
    `);
  }
}
