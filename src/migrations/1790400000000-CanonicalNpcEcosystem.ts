import { MigrationInterface, QueryRunner } from "typeorm";

export class CanonicalNpcEcosystem1790400000000
  implements MigrationInterface
{
  name = "CanonicalNpcEcosystem1790400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN IF NOT EXISTS "npc_roster_policy" varchar NOT NULL DEFAULT 'legacy',
        ADD COLUMN IF NOT EXISTS "npc_expansion_budget_total" smallint NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS "npc_expansion_budget_used" smallint NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "npcs"
        ADD COLUMN IF NOT EXISTS "profile_depth" varchar(24) NOT NULL DEFAULT 'core',
        ADD COLUMN IF NOT EXISTS "home_location_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "home_poi_id" uuid NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_npcs_home_location'
        ) THEN
          ALTER TABLE "npcs"
            ADD CONSTRAINT "FK_npcs_home_location"
            FOREIGN KEY ("home_location_id") REFERENCES "locations"("id")
            ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_npcs_home_poi'
        ) THEN
          ALTER TABLE "npcs"
            ADD CONSTRAINT "FK_npcs_home_poi"
            FOREIGN KEY ("home_poi_id") REFERENCES "location_pois"("id")
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "npc_story_hooks" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "npc_id" uuid NOT NULL,
        "hook_type" varchar(32) NOT NULL,
        "title" varchar NULL,
        "description" text NULL,
        "related_entity_type" varchar NULL,
        "related_entity_id" uuid NULL,
        "related_entity_name" varchar NULL,
        "is_known_to_party" boolean NOT NULL DEFAULT false,
        "priority" smallint NOT NULL DEFAULT 5,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_npc_story_hooks_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_npc_story_hooks_npc"
          FOREIGN KEY ("npc_id") REFERENCES "npcs"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_npcs_home_location"
        ON "npcs" ("home_location_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_npc_story_hooks_campaign_npc"
        ON "npc_story_hooks" ("campaign_id", "npc_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_npc_story_hooks_campaign_type"
        ON "npc_story_hooks" ("campaign_id", "hook_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_npc_story_hooks_campaign_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_npc_story_hooks_campaign_npc"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_npcs_home_location"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "npc_story_hooks"`);
    await queryRunner.query(`
      ALTER TABLE "npcs"
        DROP CONSTRAINT IF EXISTS "FK_npcs_home_poi",
        DROP CONSTRAINT IF EXISTS "FK_npcs_home_location"
    `);
    await queryRunner.query(`
      ALTER TABLE "npcs"
        DROP COLUMN IF EXISTS "home_poi_id",
        DROP COLUMN IF EXISTS "home_location_id",
        DROP COLUMN IF EXISTS "profile_depth"
    `);
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        DROP COLUMN IF EXISTS "npc_expansion_budget_used",
        DROP COLUMN IF EXISTS "npc_expansion_budget_total",
        DROP COLUMN IF EXISTS "npc_roster_policy"
    `);
  }
}
