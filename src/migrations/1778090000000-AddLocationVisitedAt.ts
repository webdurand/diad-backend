import { MigrationInterface, QueryRunner } from "typeorm";


export class AddLocationVisitedAt1778090000000 implements MigrationInterface {
  name = "AddLocationVisitedAt1778090000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE locations
       ADD COLUMN IF NOT EXISTS visited_at TIMESTAMPTZ NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE locations DROP COLUMN IF EXISTS visited_at`,
    );
  }
}
