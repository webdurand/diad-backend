import { MigrationInterface, QueryRunner } from "typeorm";


export class HealCampaignStartingLocationsAndOrphanScenes1783000200000 implements MigrationInterface {
  name = "HealCampaignStartingLocationsAndOrphanScenes1783000200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE campaigns c
      SET starting_location_id = (
        SELECT l.id FROM locations l
        WHERE l.campaign_id = c.id
        ORDER BY
          CASE l.type
            WHEN 'city' THEN 1
            WHEN 'region' THEN 2
            WHEN 'wilderness' THEN 3
            WHEN 'building' THEN 4
            WHEN 'continent' THEN 5
            WHEN 'dungeon' THEN 6
            WHEN 'district' THEN 7
            WHEN 'room' THEN 8
            WHEN 'dungeon_room' THEN 9
            ELSE 10
          END ASC,
          l.sort_order ASC,
          l.created_at ASC
        LIMIT 1
      )
      WHERE c.starting_location_id IS NULL
        AND EXISTS (SELECT 1 FROM locations WHERE campaign_id = c.id)
    `);

    await queryRunner.query(`
      INSERT INTO scenes (
        id, session_id, scene_number, location_id, title, description,
        is_active, started_at, mood, context_snapshot
      )
      SELECT
        gen_random_uuid(),
        gs.id,
        1,
        c.starting_location_id,
        COALESCE(c.name, 'Cena inicial'),
        'Cena bootstrap retroativa (healing migration).',
        TRUE,
        NOW(),
        NULL,
        '{}'::jsonb
      FROM game_sessions gs
      JOIN campaigns c ON c.id = gs.campaign_id
      WHERE gs.campaign_id IS NOT NULL
        AND c.starting_location_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM scenes s WHERE s.session_id = gs.id
        )
    `);
  }

  async down(): Promise<void> {

  }
}
