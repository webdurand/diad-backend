import { MigrationInterface, QueryRunner } from "typeorm";


export class BackfillConditionInstanceSource1777320000000 implements MigrationInterface {
  name = "BackfillConditionInstanceSource1777320000000";

  async up(queryRunner: QueryRunner): Promise<void> {


    await queryRunner.query(`
      UPDATE encounter_participants
      SET condition_instances = (
        SELECT COALESCE(jsonb_agg(
          CASE
            WHEN elem ? 'source' THEN elem
            ELSE elem || jsonb_build_object('source', 'manual')
          END
        ), '[]'::jsonb)
        FROM jsonb_array_elements(condition_instances) AS elem
      )
      WHERE condition_instances IS NOT NULL
        AND jsonb_typeof(condition_instances) = 'array'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(condition_instances) AS e
          WHERE NOT (e ? 'source')
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query(`
      UPDATE encounter_participants
      SET condition_instances = (
        SELECT COALESCE(jsonb_agg(elem - 'source'), '[]'::jsonb)
        FROM jsonb_array_elements(condition_instances) AS elem
      )
      WHERE condition_instances IS NOT NULL
        AND jsonb_typeof(condition_instances) = 'array'
    `);
  }
}
