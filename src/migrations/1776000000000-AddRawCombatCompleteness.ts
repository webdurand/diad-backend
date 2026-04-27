import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 004 — Encounter RAW Completeness.
 *
 * Adiciona infraestrutura para:
 * - ConditionInstance (substitui `conditions: string[]` mantendo legacy por 1 release)
 * - Concentração com rastreio de duração e appliedEffects (cascata atómica)
 * - Pool de pontos lendários por monstro
 * - Recharge de habilidades (d6 no início do turno)
 * - Vínculo de grapple (alvo → agarrador)
 * - Flag inLair no encontro
 * - Lair actions e mapa de custo de lendárias no monster
 * - Tabela nova `persistent_area_effects` para áreas tipo Spirit Guardians, Wall of Fire
 */
export class AddRawCombatCompleteness1776000000000 implements MigrationInterface {
  name = "AddRawCombatCompleteness1776000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- EncounterParticipant ---
    await queryRunner.query(`
      ALTER TABLE encounter_participants
      ADD COLUMN IF NOT EXISTS condition_instances jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS concentration_rounds_remaining int NULL,
      ADD COLUMN IF NOT EXISTS concentration_save_dc int NULL,
      ADD COLUMN IF NOT EXISTS applied_effects jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS legendary_points_available int NULL,
      ADD COLUMN IF NOT EXISTS legendary_points_max int NULL,
      ADD COLUMN IF NOT EXISTS recharge_state jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS grappled_by_participant_id varchar(36) NULL
    `);

    // Backfill: cada slug em conditions[] vira ConditionInstance com defaults
    await queryRunner.query(`
      UPDATE encounter_participants ep
      SET condition_instances = COALESCE(
        (
          SELECT jsonb_agg(jsonb_build_object(
            'id', gen_random_uuid()::text,
            'slug', slug,
            'appliedBy', NULL,
            'sourceSpell', NULL,
            'sourceConcentration', false,
            'saveAbility', NULL,
            'saveDc', NULL,
            'repeatSaveTiming', 'never',
            'durationRoundsRemaining', NULL,
            'appliedAt', NOW()::text
          ))
          FROM jsonb_array_elements_text(COALESCE(ep.conditions, '[]'::jsonb)) AS slug
        ),
        '[]'::jsonb
      )
      WHERE jsonb_typeof(ep.condition_instances) = 'array'
        AND jsonb_array_length(ep.condition_instances) = 0
        AND COALESCE(jsonb_array_length(ep.conditions), 0) > 0
    `);

    // Inicializa legendary_points para monstros lendários existentes (heurística: se monster.legendary_actions tem qualquer entry → 3 pontos)
    await queryRunner.query(`
      UPDATE encounter_participants ep
      SET legendary_points_available = 3, legendary_points_max = 3
      FROM monsters m
      WHERE ep.monster_id = m.id
        AND m.legendary_actions IS NOT NULL
        AND m.legendary_actions::text NOT IN ('null', '{}', '[]')
        AND ep.legendary_points_available IS NULL
    `);

    // --- Encounter ---
    await queryRunner.query(`
      ALTER TABLE encounters
      ADD COLUMN IF NOT EXISTS in_lair boolean NOT NULL DEFAULT false
    `);

    // --- Monster ---
    await queryRunner.query(`
      ALTER TABLE monsters
      ADD COLUMN IF NOT EXISTS lair_actions jsonb NULL,
      ADD COLUMN IF NOT EXISTS legendary_action_cost_map jsonb NULL
    `);

    // --- PersistentAreaEffect (nova tabela) ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS persistent_area_effects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
        caster_participant_id varchar(36) NULL,
        source_spell varchar(100) NOT NULL,
        shape_kind varchar(16) NOT NULL,
        origin_cell jsonb NOT NULL,
        radius_cells int NOT NULL,
        damage_dice varchar(16) NOT NULL,
        damage_type varchar(16) NOT NULL,
        save_ability varchar(3) NULL,
        save_dc int NULL,
        half_on_save boolean NOT NULL DEFAULT false,
        duration_rounds_remaining int NULL,
        source_concentration boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_persistent_area_effects_encounter
      ON persistent_area_effects(encounter_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS persistent_area_effects`);

    await queryRunner.query(`
      ALTER TABLE monsters
      DROP COLUMN IF EXISTS legendary_action_cost_map,
      DROP COLUMN IF EXISTS lair_actions
    `);

    await queryRunner.query(`
      ALTER TABLE encounters DROP COLUMN IF EXISTS in_lair
    `);

    await queryRunner.query(`
      ALTER TABLE encounter_participants
      DROP COLUMN IF EXISTS grappled_by_participant_id,
      DROP COLUMN IF EXISTS recharge_state,
      DROP COLUMN IF EXISTS legendary_points_max,
      DROP COLUMN IF EXISTS legendary_points_available,
      DROP COLUMN IF EXISTS applied_effects,
      DROP COLUMN IF EXISTS concentration_save_dc,
      DROP COLUMN IF EXISTS concentration_rounds_remaining,
      DROP COLUMN IF EXISTS condition_instances
    `);
  }
}
