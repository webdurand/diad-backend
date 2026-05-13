import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateGameEngineTables1774000000000 implements MigrationInterface {
  name = "CreateGameEngineTables1774000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query(`
      CREATE TABLE "game_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "owner_id" uuid NOT NULL,
        "status" varchar NOT NULL DEFAULT 'lobby',
        "character_ids" jsonb NOT NULL DEFAULT '[]',
        "active_encounter_id" uuid,
        "scene" jsonb NOT NULL DEFAULT '{}',
        "config" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_game_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_game_sessions_owner" FOREIGN KEY ("owner_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_game_sessions_owner" ON "game_sessions" ("owner_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "encounters" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "session_id" uuid NOT NULL,
        "name" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'preparing',
        "current_round" integer NOT NULL DEFAULT 1,
        "current_turn_index" integer NOT NULL DEFAULT 0,
        "turn_order" jsonb NOT NULL DEFAULT '[]',
        "difficulty" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_encounters" PRIMARY KEY ("id"),
        CONSTRAINT "FK_encounters_session" FOREIGN KEY ("session_id")
          REFERENCES "game_sessions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_encounters_session" ON "encounters" ("session_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "encounter_participants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "encounter_id" uuid NOT NULL,
        "type" varchar NOT NULL,
        "character_id" uuid,
        "monster_id" uuid,
        "display_name" varchar NOT NULL,
        "initiative_roll" integer,
        "initiative_modifier" integer,
        "initiative_total" integer,
        "current_hp" integer,
        "max_hp" integer,
        "temp_hp" integer NOT NULL DEFAULT 0,
        "conditions" jsonb NOT NULL DEFAULT '[]',
        "is_concentrating" boolean NOT NULL DEFAULT false,
        "concentrating_on" varchar,
        "legendary_actions_used" integer NOT NULL DEFAULT 0,
        "reactions_used" integer NOT NULL DEFAULT 0,
        "is_defeated" boolean NOT NULL DEFAULT false,
        "faction" varchar NOT NULL DEFAULT 'enemy',
        CONSTRAINT "PK_encounter_participants" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ep_encounter" FOREIGN KEY ("encounter_id")
          REFERENCES "encounters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ep_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_ep_monster" FOREIGN KEY ("monster_id")
          REFERENCES "monsters"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ep_encounter" ON "encounter_participants" ("encounter_id")`,
    );


    await queryRunner.query(`
      CREATE TABLE "game_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "session_id" uuid NOT NULL,
        "encounter_id" uuid,
        "sequence" integer NOT NULL,
        "event_type" varchar NOT NULL,
        "actor_participant_id" uuid,
        "target_participant_id" uuid,
        "data" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_game_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ge_session" FOREIGN KEY ("session_id")
          REFERENCES "game_sessions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ge_session_seq" ON "game_events" ("session_id", "sequence")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ge_encounter_seq" ON "game_events" ("encounter_id", "sequence")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "game_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "encounter_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "encounters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "game_sessions"`);
  }
}
