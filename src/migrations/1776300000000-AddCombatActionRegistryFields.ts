import { MigrationInterface, QueryRunner } from "typeorm";


export class AddCombatActionRegistryFields1776300000000 implements MigrationInterface {
  name = "AddCombatActionRegistryFields1776300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "character_state" ADD COLUMN "feature_uses_used" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );

    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN "attacks_used_this_turn" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN "attacks_max_this_turn" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN "attacks_max_this_turn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN "attacks_used_this_turn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "character_state" DROP COLUMN "feature_uses_used"`,
    );
  }
}
