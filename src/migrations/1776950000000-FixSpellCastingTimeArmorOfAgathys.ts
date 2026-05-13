import { MigrationInterface, QueryRunner } from "typeorm";


export class FixSpellCastingTimeArmorOfAgathys1776950000000 implements MigrationInterface {
  name = "FixSpellCastingTimeArmorOfAgathys1776950000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE spells SET casting_time = '1 action' WHERE slug = 'armor-of-agathys' AND casting_time <> '1 action'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {

  }
}
