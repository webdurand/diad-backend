import { MigrationInterface, QueryRunner } from "typeorm";


export class BackfillWeaponHandAndShieldEquip1786000000000 implements MigrationInterface {
  name = "BackfillWeaponHandAndShieldEquip1786000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE character_equipment ce
      SET main_hand = true
      WHERE ce.equipped = true
        AND ce.main_hand = false
        AND ce.off_hand = false
        AND EXISTS (
          SELECT 1 FROM equipments e
          WHERE e.id = ce.equipment_id
            AND e.damage IS NOT NULL
            AND e.slug NOT LIKE '%shield%'
            AND LOWER(e.name) NOT LIKE '%shield%'
        )
    `);

    await queryRunner.query(`
      UPDATE character_equipment ce
      SET off_hand = true
      WHERE ce.equipped = true
        AND ce.main_hand = false
        AND ce.off_hand = false
        AND EXISTS (
          SELECT 1 FROM equipments e
          WHERE e.id = ce.equipment_id
            AND (e.slug LIKE '%shield%' OR LOWER(e.name) LIKE '%shield%')
        )
    `);
  }

  async down(): Promise<void> {


  }
}
