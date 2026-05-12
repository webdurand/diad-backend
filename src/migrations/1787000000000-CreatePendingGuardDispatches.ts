import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePendingGuardDispatches1787000000000 implements MigrationInterface {
  name = "CreatePendingGuardDispatches1787000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pending_guard_dispatches" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "campaign_id" UUID NOT NULL,
        "session_id" UUID NOT NULL,
        "location_id" UUID NOT NULL,
        "guard_npc_ids" UUID[] NOT NULL,
        "target_sequence" INT NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
        "source_event_id" UUID,
        "severity" SMALLINT NOT NULL DEFAULT 2,
        "dispatch_reason" VARCHAR(40),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "materialized_at" TIMESTAMPTZ,
        "materialized_encounter_id" UUID,
        CONSTRAINT "fk_pending_guard_dispatches_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pending_guard_dispatches_session"
          FOREIGN KEY ("session_id") REFERENCES "game_sessions" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pending_guard_dispatches_location"
          FOREIGN KEY ("location_id") REFERENCES "locations" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_pending_guard_dispatches_session_pending"
      ON "pending_guard_dispatches" ("session_id", "status", "target_sequence")
      WHERE "status" = 'pending'
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_pending_guard_dispatches_source_event"
      ON "pending_guard_dispatches" ("source_event_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pending_guard_dispatches_source_event"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pending_guard_dispatches_session_pending"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "pending_guard_dispatches"`);
  }
}
