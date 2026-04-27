import { MigrationInterface, QueryRunner } from "typeorm";

export class AddKiPointsUsed1772300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "character_state" ADD COLUMN IF NOT EXISTS "ki_points_used" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "character_state" DROP COLUMN IF EXISTS "ki_points_used"`,
    );
  }
}
