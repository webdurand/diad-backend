import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 015 Eixo 3 — backfill `source` em `condition_instances` JSONB.
 *
 * ConditionInstance agora tem campo obrigatório `source: ConditionSource`.
 * Instâncias legadas (antes desta migration) viram `'manual'` como default.
 * Aplicações novas setam source explícito em cada caminho (applyDamage,
 * spell-casting, features handlers).
 *
 * Idempotente: WHERE `NOT ? @? '$[*].source'` garante que só atualiza
 * instances que ainda não têm o campo.
 */
export class BackfillConditionInstanceSource1777320000000 implements MigrationInterface {
  name = "BackfillConditionInstanceSource1777320000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // Adiciona source='manual' em cada elemento do array JSONB que ainda
    // não tem o campo. Executa em lote (1 UPDATE SQL, não N queries).
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
    // Remove o campo 'source' dos instances (revert completo).
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
