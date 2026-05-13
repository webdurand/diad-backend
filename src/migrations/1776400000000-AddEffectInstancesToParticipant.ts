import { MigrationInterface, QueryRunner } from "typeorm";


export class AddEffectInstancesToParticipant1776400000000 implements MigrationInterface {
  name = "AddEffectInstancesToParticipant1776400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN "effect_instances" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN "effect_instances"`,
    );
  }
}
