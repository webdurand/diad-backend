import { MigrationInterface, QueryRunner } from "typeorm";


export class NormalizeSpellCastingTimeBonus1776960000000 implements MigrationInterface {
  name = "NormalizeSpellCastingTimeBonus1776960000000";

  async up(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query(
      `UPDATE spells SET casting_time = '1 bonus action' WHERE casting_time = '1 bonus'`,
    );


    await queryRunner.query(
      `UPDATE spells
         SET casting_time = REGEXP_REPLACE(casting_time, '^1 bonus,', '1 bonus action,')
       WHERE casting_time LIKE '1 bonus,%'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {

  }
}
