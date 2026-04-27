import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 006 — Combat State Exposure.
 *
 * Renomeia o valor 'human' para 'pc' na coluna `controlled_by` da tabela
 * `encounter_participants`. A API passava a aceitar 'pc' mas o DB armazenava
 * 'human', gerando confusão (results.md §Q1). Esta migration unifica.
 *
 * Precisa dropar e recriar a check constraint `chk_controlled_by`.
 */
export class RenameHumanToPcControlMode1776600000000 implements MigrationInterface {
  name = "RenameHumanToPcControlMode1776600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop existing check constraint
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP CONSTRAINT IF EXISTS "chk_controlled_by"`,
    );

    // Rename 'human' → 'pc'
    await queryRunner.query(
      `UPDATE "encounter_participants"
       SET "controlled_by" = 'pc'
       WHERE "controlled_by" = 'human'`,
    );

    // Recreate check constraint with 'pc' instead of 'human'
    await queryRunner.query(
      `ALTER TABLE "encounter_participants"
       ADD CONSTRAINT "chk_controlled_by"
       CHECK ("controlled_by" IN ('pc', 'ai', 'dm'))`,
    );

    // Update default
    await queryRunner.query(
      `ALTER TABLE "encounter_participants"
       ALTER COLUMN "controlled_by" SET DEFAULT 'pc'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP CONSTRAINT IF EXISTS "chk_controlled_by"`,
    );

    await queryRunner.query(
      `UPDATE "encounter_participants"
       SET "controlled_by" = 'human'
       WHERE "controlled_by" = 'pc'`,
    );

    await queryRunner.query(
      `ALTER TABLE "encounter_participants"
       ADD CONSTRAINT "chk_controlled_by"
       CHECK ("controlled_by" IN ('human', 'ai', 'dm'))`,
    );

    await queryRunner.query(
      `ALTER TABLE "encounter_participants"
       ALTER COLUMN "controlled_by" SET DEFAULT 'human'`,
    );
  }
}
