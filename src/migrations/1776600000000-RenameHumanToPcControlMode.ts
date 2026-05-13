import { MigrationInterface, QueryRunner } from "typeorm";


export class RenameHumanToPcControlMode1776600000000 implements MigrationInterface {
  name = "RenameHumanToPcControlMode1776600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP CONSTRAINT IF EXISTS "chk_controlled_by"`,
    );


    await queryRunner.query(
      `UPDATE "encounter_participants"
       SET "controlled_by" = 'pc'
       WHERE "controlled_by" = 'human'`,
    );


    await queryRunner.query(
      `ALTER TABLE "encounter_participants"
       ADD CONSTRAINT "chk_controlled_by"
       CHECK ("controlled_by" IN ('pc', 'ai', 'dm'))`,
    );


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
