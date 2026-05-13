import { MigrationInterface, QueryRunner } from "typeorm";


export class CreateReputationFoundation1785000000000 implements MigrationInterface {
  name = "CreateReputationFoundation1785000000000";

  async up(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "npc_reputation" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "npc_id" uuid NOT NULL,
        "campaign_id" uuid NOT NULL,
        "tier" smallint NOT NULL DEFAULT 0,
        "score" integer NOT NULL DEFAULT 0,
        "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "last_event_id" uuid NULL,
        "last_event_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_npc_reputation" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_npc_reputation" UNIQUE ("npc_id", "campaign_id"),
        CONSTRAINT "FK_npc_rep_npc" FOREIGN KEY ("npc_id")
          REFERENCES "npcs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_npc_rep_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "npc_reputation_tier_check"
          CHECK ("tier" BETWEEN -3 AND 3),
        CONSTRAINT "npc_reputation_score_check"
          CHECK ("score" BETWEEN -100 AND 100)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_npc_rep_campaign" ON "npc_reputation" ("campaign_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_npc_rep_tier" ON "npc_reputation" ("campaign_id", "tier") WHERE "tier" <> 0`,
    );


    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "faction_reputation" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "faction_id" uuid NOT NULL,
        "campaign_id" uuid NOT NULL,
        "tier" smallint NOT NULL DEFAULT 0,
        "score" integer NOT NULL DEFAULT 0,
        "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "last_event_id" uuid NULL,
        "last_event_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_faction_reputation" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_faction_reputation" UNIQUE ("faction_id", "campaign_id"),
        CONSTRAINT "FK_fac_rep_faction" FOREIGN KEY ("faction_id")
          REFERENCES "factions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_fac_rep_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "faction_reputation_tier_check"
          CHECK ("tier" BETWEEN -3 AND 3),
        CONSTRAINT "faction_reputation_score_check"
          CHECK ("score" BETWEEN -100 AND 100)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fac_rep_campaign" ON "faction_reputation" ("campaign_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fac_rep_campaign"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "faction_reputation"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_npc_rep_tier"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_npc_rep_campaign"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "npc_reputation"`);
  }
}
