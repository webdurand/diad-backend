import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Healing one-shot. Preenche `scenes.location_id` em rows legacy NULL
 * usando, em ordem:
 *   1. location_id da scene anterior (menor sceneNumber) na mesma session
 *   2. campaigns.starting_location_id quando session.campaign_id existe
 *
 * Idempotente. Roda uma vez em produção pra alinhar dados existentes
 * com o novo fallback determinístico do SceneService.
 */
export class HealSceneLocationIds1783000100000 implements MigrationInterface {
  name = "HealSceneLocationIds1783000100000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE scenes target
      SET location_id = prev.location_id
      FROM (
        SELECT DISTINCT ON (session_id) session_id, location_id
        FROM scenes
        WHERE location_id IS NOT NULL
        ORDER BY session_id, scene_number ASC
      ) prev
      WHERE target.session_id = prev.session_id
        AND target.location_id IS NULL
    `);

    await queryRunner.query(`
      UPDATE scenes target
      SET location_id = c.starting_location_id
      FROM game_sessions s
      JOIN campaigns c ON c.id = s.campaign_id
      WHERE target.session_id = s.id
        AND target.location_id IS NULL
        AND c.starting_location_id IS NOT NULL
    `);
  }

  async down(): Promise<void> {
    // Sem reversão: healing one-shot não rastreia quais rows ele tocou.
    // Down() é no-op intencional.
  }
}
