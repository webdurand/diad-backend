import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDialogueOpeningToArchetypes1790800000000
  implements MigrationInterface
{
  name = "AddDialogueOpeningToArchetypes1790800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "opening_archetypes"
        ADD COLUMN IF NOT EXISTS "opens_in_dialogue" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "opening_archetypes"
        ADD COLUMN IF NOT EXISTS "initial_focal_npc_slot" varchar(120) NULL
    `);

    await queryRunner.query(`
      UPDATE "opening_archetypes"
      SET
        "opens_in_dialogue" = true,
        "initial_focal_npc_slot" = 'npc.encounter.focal',
        "updated_at" = now()
      WHERE "key" IN ('encontro_fatidico', 'divida_cobrada')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "opening_archetypes"
        DROP COLUMN IF EXISTS "initial_focal_npc_slot"
    `);
    await queryRunner.query(`
      ALTER TABLE "opening_archetypes"
        DROP COLUMN IF EXISTS "opens_in_dialogue"
    `);
  }
}
