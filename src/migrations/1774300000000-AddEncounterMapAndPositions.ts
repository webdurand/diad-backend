import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEncounterMapAndPositions1774300000000
  implements MigrationInterface
{
  name = 'AddEncounterMapAndPositions1774300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "encounters" ADD COLUMN IF NOT EXISTS "map_data" jsonb NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN IF NOT EXISTS "position_x" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN IF NOT EXISTS "position_y" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN IF NOT EXISTS "is_visible" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN IF EXISTS "is_visible"`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN IF EXISTS "position_y"`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN IF EXISTS "position_x"`,
    );
    await queryRunner.query(
      `ALTER TABLE "encounters" DROP COLUMN IF EXISTS "map_data"`,
    );
  }
}
