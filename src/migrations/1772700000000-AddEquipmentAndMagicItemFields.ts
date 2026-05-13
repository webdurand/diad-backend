import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEquipmentAndMagicItemFields1772700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query(`
      ALTER TABLE "equipments"
        ADD COLUMN IF NOT EXISTS "stealth_disadvantage" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "str_minimum" integer,
        ADD COLUMN IF NOT EXISTS "weapon_category" text,
        ADD COLUMN IF NOT EXISTS "don_time" text,
        ADD COLUMN IF NOT EXISTS "doff_time" text
    `);


    await queryRunner.query(`
      ALTER TABLE "magic_items"
        ADD COLUMN IF NOT EXISTS "weight" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "cost" jsonb,
        ADD COLUMN IF NOT EXISTS "attunement" jsonb,
        ADD COLUMN IF NOT EXISTS "bonuses" jsonb,
        ADD COLUMN IF NOT EXISTS "charges_info" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "equipments"
        DROP COLUMN IF EXISTS "stealth_disadvantage",
        DROP COLUMN IF EXISTS "str_minimum",
        DROP COLUMN IF EXISTS "weapon_category",
        DROP COLUMN IF EXISTS "don_time",
        DROP COLUMN IF EXISTS "doff_time"
    `);

    await queryRunner.query(`
      ALTER TABLE "magic_items"
        DROP COLUMN IF EXISTS "weight",
        DROP COLUMN IF EXISTS "cost",
        DROP COLUMN IF EXISTS "attunement",
        DROP COLUMN IF EXISTS "bonuses",
        DROP COLUMN IF EXISTS "charges_info"
    `);
  }
}
