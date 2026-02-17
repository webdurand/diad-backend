import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEquipmentMastery1772600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equipments" ADD COLUMN "mastery" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equipments" DROP COLUMN "mastery"`,
    );
  }
}
