import { MigrationInterface, QueryRunner } from "typeorm";


export class CreateWeatherAndGameClock1783000000000 implements MigrationInterface {
  name = "CreateWeatherAndGameClock1783000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS weather (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        scene_id UUID NULL REFERENCES scenes(id) ON DELETE CASCADE,
        precipitation VARCHAR(16) NOT NULL DEFAULT 'clear',
        visibility VARCHAR(16) NOT NULL DEFAULT 'normal',
        temperature VARCHAR(16) NOT NULL DEFAULT 'mild',
        wind_strength VARCHAR(16) NOT NULL DEFAULT 'calm',
        magical_anomaly VARCHAR(24) NULL,
        affects_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
        narrative_seed VARCHAR(280) NULL,
        rolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT weather_precipitation_check
          CHECK (precipitation IN ('clear','rain','storm','snow','fog','magical')),
        CONSTRAINT weather_visibility_check
          CHECK (visibility IN ('normal','dim','dark','obscured')),
        CONSTRAINT weather_temperature_check
          CHECK (temperature IN ('frigid','cold','mild','hot','extreme')),
        CONSTRAINT weather_wind_check
          CHECK (wind_strength IN ('calm','breeze','strong','gale')),
        CONSTRAINT weather_magical_check
          CHECK (magical_anomaly IS NULL OR magical_anomaly IN
            ('dead_magic','wild_magic','antimagic_field','weave_unstable'))
      )
    `);


    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_weather_campaign_scene
        ON weather(campaign_id, scene_id) NULLS NOT DISTINCT
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_weather_campaign
        ON weather(campaign_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS game_clocks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
        current_in_game_datetime TIMESTAMPTZ NOT NULL DEFAULT now(),
        sunrise_time VARCHAR(5) NOT NULL DEFAULT '06:00',
        sunset_time VARCHAR(5) NOT NULL DEFAULT '18:00',
        days_passed INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT game_clocks_sunrise_check
          CHECK (sunrise_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
        CONSTRAINT game_clocks_sunset_check
          CHECK (sunset_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
        CONSTRAINT game_clocks_days_check CHECK (days_passed >= 0)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS game_clocks`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_weather_campaign`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_weather_campaign_scene`);
    await queryRunner.query(`DROP TABLE IF EXISTS weather`);
  }
}
