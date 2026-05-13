import { MigrationInterface, QueryRunner } from "typeorm";


export class AddRecklessAttackFlag1776300100000 implements MigrationInterface {
  name = "AddRecklessAttackFlag1776300100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN "reckless_attack_active" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN "reckless_attack_active"`,
    );
  }
}
