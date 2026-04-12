import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMovementAndActionEconomy1774800000000
  implements MigrationInterface
{
  name = 'AddMovementAndActionEconomy1774800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN IF NOT EXISTS "movement_remaining" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN IF NOT EXISTS "action_used" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN IF NOT EXISTS "bonus_action_used" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN IF NOT EXISTS "has_dashed" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN IF NOT EXISTS "has_disengaged" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN IF EXISTS "has_disengaged"`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN IF EXISTS "has_dashed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN IF EXISTS "bonus_action_used"`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN IF EXISTS "action_used"`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN IF EXISTS "movement_remaining"`,
    );
  }
}
