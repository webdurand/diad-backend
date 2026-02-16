import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSourceMetadata1772400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new metadata columns to comp_sources
    await queryRunner.query(
      `ALTER TABLE "comp_sources" ADD COLUMN IF NOT EXISTS "abbreviation" VARCHAR`,
    );
    await queryRunner.query(
      `ALTER TABLE "comp_sources" ADD COLUMN IF NOT EXISTS "edition" VARCHAR`,
    );
    await queryRunner.query(
      `ALTER TABLE "comp_sources" ADD COLUMN IF NOT EXISTS "year" INTEGER`,
    );
    await queryRunner.query(
      `ALTER TABLE "comp_sources" ADD COLUMN IF NOT EXISTS "group" VARCHAR`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comp_sources" DROP COLUMN IF EXISTS "group"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comp_sources" DROP COLUMN IF EXISTS "year"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comp_sources" DROP COLUMN IF EXISTS "edition"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comp_sources" DROP COLUMN IF EXISTS "abbreviation"`,
    );
  }
}
