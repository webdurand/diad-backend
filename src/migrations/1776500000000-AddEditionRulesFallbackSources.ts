import { MigrationInterface, QueryRunner } from "typeorm";


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
