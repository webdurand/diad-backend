import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 003 B-lite — flag para Reckless Attack (Barbarian L2+).
 *
 * Enquanto `reckless_attack_active = true` no turno do barbarian, melee STR
 * attacks ganham advantage E todos os attacks contra o barbarian ganham advantage
 * (a resolução aplica na Spec 4). Expira no start-turn do próprio barbarian.
 */
export class AddRecklessAttackFlag1776300100000
  implements MigrationInterface
{
  name = 'AddRecklessAttackFlag1776300100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" ADD COLUMN "reckless_attack_active" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "encounter_participants" DROP COLUMN "reckless_attack_active"`,
    );
  }
}
