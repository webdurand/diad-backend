import { MigrationInterface, QueryRunner } from "typeorm";

export class ReplaceAgeWithBirthDate1772000002000 implements MigrationInterface {
  name = "ReplaceAgeWithBirthDate1772000002000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "birth_date" date`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "age"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "age" integer`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "birth_date"`);
  }
}
