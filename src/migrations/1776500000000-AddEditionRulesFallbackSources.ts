import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 005 — Level-up PHB Unified.
 *
 * Adiciona `featureFallbackSource: 'XPHB'` e `classFallbackSource: 'XPHB'` ao
 * JSONB `rules` da CompSourceEntity code='PHB'. Zero alteração de schema;
 * apenas dados. Permite que PHB PCs subam de nível mesmo quando LevelEntity
 * PHB para aquele (class_id, level) não foi seedada (XPHB é usado como
 * fallback, com flag `featureSourceFallback` no response).
 */
export class AddEditionRulesFallbackSources1776500000000 implements MigrationInterface {
  name = "AddEditionRulesFallbackSources1776500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "comp_sources"
       SET "rules" = COALESCE("rules", '{}'::jsonb) || jsonb_build_object(
         'featureFallbackSource', 'XPHB',
         'classFallbackSource', 'XPHB'
       )
       WHERE "code" = 'PHB'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "comp_sources"
       SET "rules" = "rules" - 'featureFallbackSource' - 'classFallbackSource'
       WHERE "code" = 'PHB'`,
    );
  }
}
