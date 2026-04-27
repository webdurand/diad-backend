import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExhaustionAndInspiration1773200000000 implements MigrationInterface {
  name = "AddExhaustionAndInspiration1773200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "character_state" ADD COLUMN IF NOT EXISTS "exhaustion_level" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "character_state" ADD COLUMN IF NOT EXISTS "inspiration" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "character_state" DROP COLUMN IF EXISTS "inspiration"`,
    );
    await queryRunner.query(
      `ALTER TABLE "character_state" DROP COLUMN IF EXISTS "exhaustion_level"`,
    );
  }
}
