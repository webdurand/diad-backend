import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSessionTables1774200000000 implements MigrationInterface {
  name = "CreateSessionTables1774200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query(`
      CREATE TABLE "scenes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "session_id" uuid NOT NULL,
        "location_id" uuid,
        "scene_number" integer NOT NULL,
        "title" varchar,
        "description" text,
        "mood" varchar,
        "is_active" boolean NOT NULL DEFAULT false,
        "context_snapshot" jsonb NOT NULL DEFAULT '{}',
        "started_at" timestamptz,
        "ended_at" timestamptz,
        CONSTRAINT "PK_scenes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_scenes_session" FOREIGN KEY ("session_id")
          REFERENCES "game_sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_scenes_location" FOREIGN KEY ("location_id")
          REFERENCES "locations"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_scenes_session" ON "scenes" ("session_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "scene_npcs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "scene_id" uuid NOT NULL,
        "npc_id" uuid NOT NULL,
        CONSTRAINT "PK_scene_npcs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_scene_npcs" UNIQUE ("scene_id", "npc_id"),
        CONSTRAINT "FK_sn_scene" FOREIGN KEY ("scene_id")
          REFERENCES "scenes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sn_npc" FOREIGN KEY ("npc_id")
          REFERENCES "npcs"("id") ON DELETE CASCADE
      )
    `);


    await queryRunner.query(`
      CREATE TABLE "session_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "session_id" uuid NOT NULL,
        "scene_id" uuid,
        "event_type" varchar NOT NULL,
        "sequence" integer NOT NULL,
        "summary" text NOT NULL,
        "details" jsonb NOT NULL DEFAULT '{}',
        "actor_character_id" uuid,
        "actor_npc_id" uuid,
        "is_visible_to_players" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_session_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_se_session" FOREIGN KEY ("session_id")
          REFERENCES "game_sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_se_scene" FOREIGN KEY ("scene_id")
          REFERENCES "scenes"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_se_session" ON "session_events" ("session_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_se_session_seq" ON "session_events" ("session_id", "sequence")`,
    );


    await queryRunner.query(`
      CREATE TABLE "campaign_chronicles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "session_id" uuid,
        "entry_date" varchar,
        "title" varchar NOT NULL,
        "content" text NOT NULL,
        "entity_changes" jsonb NOT NULL DEFAULT '{}',
        "significance" integer NOT NULL DEFAULT 5,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_chronicles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cc_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cc_session" FOREIGN KEY ("session_id")
          REFERENCES "game_sessions"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cc_campaign" ON "campaign_chronicles" ("campaign_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cc_significance" ON "campaign_chronicles" ("campaign_id", "significance" DESC)`,
    );


    await queryRunner.query(`
      CREATE TABLE "party_knowledge" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "entity_type" varchar NOT NULL,
        "entity_id" uuid NOT NULL,
        "knowledge_key" varchar NOT NULL,
        "knowledge_value" text,
        "discovered_in_session_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_party_knowledge" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_party_knowledge" UNIQUE ("campaign_id", "entity_type", "entity_id", "knowledge_key"),
        CONSTRAINT "FK_pk_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pk_session" FOREIGN KEY ("discovered_in_session_id")
          REFERENCES "game_sessions"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_pk_campaign_entity" ON "party_knowledge" ("campaign_id", "entity_type", "entity_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "party_knowledge"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_chronicles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "session_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scene_npcs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scenes"`);
  }
}
