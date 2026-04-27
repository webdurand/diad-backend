import { MigrationInterface, QueryRunner } from "typeorm";

export class AddClassToolChoiceAndAlwaysPrepared1772500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "tool_choice" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "always_prepared_spells" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "classes" DROP COLUMN IF EXISTS "always_prepared_spells"`,
    );
    await queryRunner.query(
      `ALTER TABLE "classes" DROP COLUMN IF EXISTS "tool_choice"`,
    );
  }
}
