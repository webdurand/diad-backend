import { MigrationInterface, QueryRunner } from "typeorm";


export class CreateEncounterJoinRequests1776200000000 implements MigrationInterface {
  name = "CreateEncounterJoinRequests1776200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "encounter_join_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "encounter_id" uuid NOT NULL,
        "character_id" uuid NOT NULL,
        "requested_by_user_id" uuid NOT NULL,
        "status" varchar NOT NULL DEFAULT 'pending',
        "rejection_reason" text,
        "resolved_by_user_id" uuid,
        "resolved_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_encounter_join_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ejr_encounter" FOREIGN KEY ("encounter_id")
          REFERENCES "encounters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ejr_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ejr_requested_by" FOREIGN KEY ("requested_by_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ejr_resolved_by" FOREIGN KEY ("resolved_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CK_ejr_status" CHECK ("status" IN ('pending', 'approved', 'rejected'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ejr_encounter" ON "encounter_join_requests" ("encounter_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ejr_character" ON "encounter_join_requests" ("character_id")`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ejr_encounter_character_pending" ON "encounter_join_requests" ("encounter_id", "character_id") WHERE status = 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ejr_encounter_character_pending"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ejr_character"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ejr_encounter"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "encounter_join_requests"`);
  }
}
