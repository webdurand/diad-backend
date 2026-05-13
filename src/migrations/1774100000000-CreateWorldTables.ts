import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWorldTables1774100000000 implements MigrationInterface {
  name = "CreateWorldTables1774100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query(`
      CREATE TABLE "campaigns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "slug" varchar NOT NULL,
        "name" varchar NOT NULL,
        "description" text,
        "setting" varchar,
        "theme" varchar,
        "difficulty" varchar NOT NULL DEFAULT 'standard',
        "dm_user_id" uuid NOT NULL,
        "status" varchar NOT NULL DEFAULT 'draft',
        "world_lore" text,
        "rules_variant" jsonb NOT NULL DEFAULT '{}',
        "invite_code" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaigns" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaigns_slug" UNIQUE ("slug"),
        CONSTRAINT "UQ_campaigns_invite_code" UNIQUE ("invite_code"),
        CONSTRAINT "FK_campaigns_dm" FOREIGN KEY ("dm_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaigns_dm" ON "campaigns" ("dm_user_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "campaign_players" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "character_id" uuid,
        "joined_at" timestamptz NOT NULL DEFAULT now(),
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_campaign_players" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaign_players" UNIQUE ("campaign_id", "user_id"),
        CONSTRAINT "FK_cp_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cp_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cp_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cp_campaign" ON "campaign_players" ("campaign_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cp_user" ON "campaign_players" ("user_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "locations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "parent_id" uuid,
        "name" varchar NOT NULL,
        "slug" varchar NOT NULL,
        "type" varchar NOT NULL,
        "description" text,
        "description_hidden" text,
        "atmosphere" varchar,
        "tags" jsonb NOT NULL DEFAULT '[]',
        "properties" jsonb NOT NULL DEFAULT '{}',
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_locations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_locations_slug" UNIQUE ("campaign_id", "slug"),
        CONSTRAINT "FK_loc_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_loc_parent" FOREIGN KEY ("parent_id")
          REFERENCES "locations"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_loc_campaign" ON "locations" ("campaign_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_loc_parent" ON "locations" ("parent_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "location_connections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "from_location_id" uuid NOT NULL,
        "to_location_id" uuid NOT NULL,
        "description" varchar,
        "travel_time" varchar,
        "is_hidden" boolean NOT NULL DEFAULT false,
        "is_locked" boolean NOT NULL DEFAULT false,
        "requirements" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_location_connections" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_location_connections" UNIQUE ("from_location_id", "to_location_id"),
        CONSTRAINT "FK_lc_from" FOREIGN KEY ("from_location_id")
          REFERENCES "locations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lc_to" FOREIGN KEY ("to_location_id")
          REFERENCES "locations"("id") ON DELETE CASCADE
      )
    `);


    await queryRunner.query(`
      CREATE TABLE "factions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "name" varchar NOT NULL,
        "slug" varchar NOT NULL,
        "description" text,
        "goals" jsonb NOT NULL DEFAULT '[]',
        "alignment" varchar,
        "influence_level" integer NOT NULL DEFAULT 5,
        "is_known_to_party" boolean NOT NULL DEFAULT false,
        "headquarters_location_id" uuid,
        "tags" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_factions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_factions_slug" UNIQUE ("campaign_id", "slug"),
        CONSTRAINT "FK_fac_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_fac_hq" FOREIGN KEY ("headquarters_location_id")
          REFERENCES "locations"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_fac_campaign" ON "factions" ("campaign_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "npcs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "name" varchar NOT NULL,
        "slug" varchar NOT NULL,
        "title" varchar,
        "race" varchar,
        "description" text,
        "description_hidden" text,
        "status" varchar NOT NULL DEFAULT 'alive',
        "disposition" varchar NOT NULL DEFAULT 'neutral',
        "current_location_id" uuid,
        "monster_id" uuid,
        "personality_big5" jsonb NOT NULL DEFAULT '{}',
        "motivation" text,
        "knowledge_scope" jsonb NOT NULL DEFAULT '[]',
        "dialogue_style" varchar,
        "voice_notes" text,
        "tags" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_npcs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_npcs_slug" UNIQUE ("campaign_id", "slug"),
        CONSTRAINT "FK_npc_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_npc_location" FOREIGN KEY ("current_location_id")
          REFERENCES "locations"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_npc_monster" FOREIGN KEY ("monster_id")
          REFERENCES "monsters"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_npc_campaign" ON "npcs" ("campaign_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_npc_location" ON "npcs" ("current_location_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "npc_relationships" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "source_npc_id" uuid NOT NULL,
        "target_npc_id" uuid,
        "target_faction_id" uuid,
        "relationship_type" varchar NOT NULL,
        "description" text,
        "strength" integer NOT NULL DEFAULT 5,
        "is_known_to_party" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_npc_relationships" PRIMARY KEY ("id"),
        CONSTRAINT "FK_nr_source" FOREIGN KEY ("source_npc_id")
          REFERENCES "npcs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_nr_target_npc" FOREIGN KEY ("target_npc_id")
          REFERENCES "npcs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_nr_target_faction" FOREIGN KEY ("target_faction_id")
          REFERENCES "factions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_nr_source" ON "npc_relationships" ("source_npc_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "faction_relations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "faction_a_id" uuid NOT NULL,
        "faction_b_id" uuid NOT NULL,
        "relation_type" varchar NOT NULL,
        "description" text,
        "is_known_to_party" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_faction_relations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_faction_relations" UNIQUE ("faction_a_id", "faction_b_id"),
        CONSTRAINT "FK_fr_a" FOREIGN KEY ("faction_a_id")
          REFERENCES "factions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_fr_b" FOREIGN KEY ("faction_b_id")
          REFERENCES "factions"("id") ON DELETE CASCADE
      )
    `);


    await queryRunner.query(`
      CREATE TABLE "story_arcs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "name" varchar NOT NULL,
        "description" text,
        "sort_order" integer NOT NULL DEFAULT 0,
        "current_phase" varchar NOT NULL DEFAULT 'hook',
        "phase_notes" jsonb NOT NULL DEFAULT '{}',
        "is_active" boolean NOT NULL DEFAULT true,
        "is_main_arc" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_story_arcs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sa_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_sa_campaign" ON "story_arcs" ("campaign_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "quests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "story_arc_id" uuid,
        "name" varchar NOT NULL,
        "slug" varchar NOT NULL,
        "description" text,
        "description_hidden" text,
        "status" varchar NOT NULL DEFAULT 'unknown',
        "giver_npc_id" uuid,
        "location_id" uuid,
        "rewards" jsonb NOT NULL DEFAULT '{}',
        "level_range" jsonb,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quests" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_quests_slug" UNIQUE ("campaign_id", "slug"),
        CONSTRAINT "FK_q_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_q_arc" FOREIGN KEY ("story_arc_id")
          REFERENCES "story_arcs"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_q_npc" FOREIGN KEY ("giver_npc_id")
          REFERENCES "npcs"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_q_location" FOREIGN KEY ("location_id")
          REFERENCES "locations"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_q_campaign" ON "quests" ("campaign_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "quest_objectives" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "quest_id" uuid NOT NULL,
        "description" text NOT NULL,
        "status" varchar NOT NULL DEFAULT 'locked',
        "path_group" varchar,
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_optional" boolean NOT NULL DEFAULT false,
        "completion_conditions" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_quest_objectives" PRIMARY KEY ("id"),
        CONSTRAINT "FK_qo_quest" FOREIGN KEY ("quest_id")
          REFERENCES "quests"("id") ON DELETE CASCADE
      )
    `);


    await queryRunner.query(`
      CREATE TABLE "quest_prerequisites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "quest_id" uuid NOT NULL,
        "required_quest_id" uuid NOT NULL,
        "required_status" varchar NOT NULL DEFAULT 'completed',
        CONSTRAINT "PK_quest_prerequisites" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_quest_prerequisites" UNIQUE ("quest_id", "required_quest_id"),
        CONSTRAINT "FK_qp_quest" FOREIGN KEY ("quest_id")
          REFERENCES "quests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_qp_required" FOREIGN KEY ("required_quest_id")
          REFERENCES "quests"("id") ON DELETE CASCADE
      )
    `);


    await queryRunner.query(`
      CREATE TABLE "loot_tables" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "location_id" uuid,
        "npc_id" uuid,
        "name" varchar NOT NULL,
        "is_shop" boolean NOT NULL DEFAULT false,
        "is_looted" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loot_tables" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lt_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lt_location" FOREIGN KEY ("location_id")
          REFERENCES "locations"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_lt_npc" FOREIGN KEY ("npc_id")
          REFERENCES "npcs"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_lt_campaign" ON "loot_tables" ("campaign_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "loot_table_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "loot_table_id" uuid NOT NULL,
        "equipment_id" uuid,
        "magic_item_id" uuid,
        "quantity" integer NOT NULL DEFAULT 1,
        "price_override" jsonb,
        "drop_chance" float NOT NULL DEFAULT 1.0,
        CONSTRAINT "PK_loot_table_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lti_table" FOREIGN KEY ("loot_table_id")
          REFERENCES "loot_tables"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lti_equipment" FOREIGN KEY ("equipment_id")
          REFERENCES "equipments"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_lti_magic_item" FOREIGN KEY ("magic_item_id")
          REFERENCES "magic_items"("id") ON DELETE SET NULL
      )
    `);


    await queryRunner.query(`
      CREATE TABLE "encounter_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "location_id" uuid,
        "name" varchar NOT NULL,
        "description" text,
        "difficulty" varchar NOT NULL DEFAULT 'medium',
        "monsters" jsonb NOT NULL DEFAULT '[]',
        "npc_combatants" jsonb NOT NULL DEFAULT '[]',
        "environment" jsonb NOT NULL DEFAULT '{}',
        "trigger_conditions" jsonb NOT NULL DEFAULT '{}',
        "is_triggered" boolean NOT NULL DEFAULT false,
        "xp_reward" integer,
        "loot_table_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_encounter_templates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_et_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_et_location" FOREIGN KEY ("location_id")
          REFERENCES "locations"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_et_loot" FOREIGN KEY ("loot_table_id")
          REFERENCES "loot_tables"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_et_campaign" ON "encounter_templates" ("campaign_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "encounter_templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loot_table_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loot_tables"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quest_prerequisites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quest_objectives"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "story_arcs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "faction_relations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "npc_relationships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "npcs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "factions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "location_connections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "locations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_players"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaigns"`);
  }
}
