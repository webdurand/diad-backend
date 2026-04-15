import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 004 — Effect Resolution Engine.
 *
 * Novo campo `effect_instances` JSONB em encounter_participants carrega a
 * mecânica dos effects (ac_bonus, attack_bonus, grant_advantage_to_attackers,
 * damage_resistance, inspiration_die, etc). Separado de `applied_effects`
 * (que é tracker de concentração, legacy) por SRP: cada tipo tem uma
 * responsabilidade única.
 */
export class AddEffectInstancesToParticipant1776400000000
  implements MigrationInterface
{
  name = 'AddEffectInstancesToParticipant1776400000000';

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
