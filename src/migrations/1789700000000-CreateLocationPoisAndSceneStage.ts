import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateLocationPoisAndSceneStage1789700000000 implements MigrationInterface {
  name = "CreateLocationPoisAndSceneStage1789700000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS location_pois (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        campaign_id uuid NOT NULL,
        location_id uuid NOT NULL,
        name varchar NOT NULL,
        slug varchar NOT NULL,
        type varchar NOT NULL DEFAULT 'area',
        description text,
        atmosphere varchar,
        aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        is_default boolean NOT NULL DEFAULT false,
        is_secret boolean NOT NULL DEFAULT false,
        is_known_to_party boolean NOT NULL DEFAULT true,
        is_locked boolean NOT NULL DEFAULT false,
        sort_order int NOT NULL DEFAULT 0,
        properties jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_location_pois PRIMARY KEY (id),
        CONSTRAINT uq_location_pois_location_slug UNIQUE (location_id, slug),
        CONSTRAINT fk_location_pois_campaign FOREIGN KEY (campaign_id)
          REFERENCES campaigns(id) ON DELETE CASCADE,
        CONSTRAINT fk_location_pois_location FOREIGN KEY (location_id)
          REFERENCES locations(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_location_pois_campaign
      ON location_pois (campaign_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_location_pois_location
      ON location_pois (location_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_location_pois_known
      ON location_pois (location_id, is_known_to_party, is_secret, is_locked)
    `);

    await queryRunner.query(`
      INSERT INTO location_pois (
        campaign_id,
        location_id,
        name,
        slug,
        type,
        description,
        atmosphere,
        aliases,
        tags,
        is_default,
        is_secret,
        is_known_to_party,
        sort_order
      )
      SELECT
        l.campaign_id,
        l.id,
        'Area principal',
        'area-principal',
        COALESCE(NULLIF(l.type, ''), 'area'),
        l.description,
        l.atmosphere,
        '[]'::jsonb,
        '["default"]'::jsonb,
        true,
        false,
        true,
        0
      FROM locations l
      WHERE NOT EXISTS (
        SELECT 1 FROM location_pois p WHERE p.location_id = l.id
      )
    `);

    await queryRunner.query(`
      ALTER TABLE scenes
      ADD COLUMN IF NOT EXISTS poi_id uuid,
      ADD COLUMN IF NOT EXISTS current_interlocutor_npc_id uuid
    `);
    await queryRunner.query(`
      ALTER TABLE scenes
      DROP CONSTRAINT IF EXISTS fk_scenes_poi
    `);
    await queryRunner.query(`
      ALTER TABLE scenes
      ADD CONSTRAINT fk_scenes_poi FOREIGN KEY (poi_id)
      REFERENCES location_pois(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE scenes
      DROP CONSTRAINT IF EXISTS fk_scenes_current_interlocutor
    `);
    await queryRunner.query(`
      ALTER TABLE scenes
      ADD CONSTRAINT fk_scenes_current_interlocutor
      FOREIGN KEY (current_interlocutor_npc_id)
      REFERENCES npcs(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_scenes_poi ON scenes (poi_id)
    `);

    await queryRunner.query(`
      UPDATE scenes s
      SET poi_id = p.id
      FROM location_pois p
      WHERE s.poi_id IS NULL
        AND s.location_id = p.location_id
        AND p.is_default = true
    `);

    await queryRunner.query(`
      ALTER TABLE session_npc_state
      ADD COLUMN IF NOT EXISTS current_poi_id uuid
    `);
    await queryRunner.query(`
      ALTER TABLE session_npc_state
      DROP CONSTRAINT IF EXISTS fk_session_npc_state_current_poi
    `);
    await queryRunner.query(`
      ALTER TABLE session_npc_state
      ADD CONSTRAINT fk_session_npc_state_current_poi
      FOREIGN KEY (current_poi_id)
      REFERENCES location_pois(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_session_npc_state_current_poi
      ON session_npc_state (current_poi_id)
    `);

    await queryRunner.query(`
      ALTER TABLE scene_npcs
      ADD COLUMN IF NOT EXISTS presence_role varchar NOT NULL DEFAULT 'present'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE scene_npcs DROP COLUMN IF EXISTS presence_role
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_session_npc_state_current_poi
    `);
    await queryRunner.query(`
      ALTER TABLE session_npc_state
      DROP CONSTRAINT IF EXISTS fk_session_npc_state_current_poi
    `);
    await queryRunner.query(`
      ALTER TABLE session_npc_state DROP COLUMN IF EXISTS current_poi_id
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_scenes_poi
    `);
    await queryRunner.query(`
      ALTER TABLE scenes DROP CONSTRAINT IF EXISTS fk_scenes_current_interlocutor
    `);
    await queryRunner.query(`
      ALTER TABLE scenes DROP CONSTRAINT IF EXISTS fk_scenes_poi
    `);
    await queryRunner.query(`
      ALTER TABLE scenes
      DROP COLUMN IF EXISTS current_interlocutor_npc_id,
      DROP COLUMN IF EXISTS poi_id
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_location_pois_known
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_location_pois_location
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_location_pois_campaign
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS location_pois`);
  }
}
