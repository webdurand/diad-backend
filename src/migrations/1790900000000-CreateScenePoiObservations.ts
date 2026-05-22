import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateScenePoiObservations1790900000000
  implements MigrationInterface
{
  name = "CreateScenePoiObservations1790900000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS scene_poi_observations (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        session_id uuid NOT NULL,
        poi_id uuid NOT NULL,
        last_scene_id uuid NULL,
        observation_text text NOT NULL,
        generated_at_turn int NOT NULL,
        expires_at_turn int NOT NULL,
        freshness varchar(16) NOT NULL DEFAULT 'fresh',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_scene_poi_observations PRIMARY KEY (id),
        CONSTRAINT uq_scene_poi_observations_session_poi UNIQUE (session_id, poi_id),
        CONSTRAINT fk_scene_poi_observations_session FOREIGN KEY (session_id)
          REFERENCES game_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_scene_poi_observations_poi FOREIGN KEY (poi_id)
          REFERENCES location_pois(id) ON DELETE CASCADE,
        CONSTRAINT fk_scene_poi_observations_last_scene FOREIGN KEY (last_scene_id)
          REFERENCES scenes(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_scene_poi_observations_session
      ON scene_poi_observations (session_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_scene_poi_observations_poi
      ON scene_poi_observations (poi_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_scene_poi_observations_poi
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_scene_poi_observations_session
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS scene_poi_observations`);
  }
}
