import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 003 — Combat Action Registry foundation.
 *
 * Adiciona:
 *  1. `character_state.feature_uses_used` (JSONB) — contador de usos consumidos por
 *     feature slug (mesmo padrão de `spell_slots_used`, `hit_dice_used`).
 *     Max vem do SRD derivado de classe+nível; `remaining = max - used`.
 *     Reset em short/long rest por `feature.rechargeOn`.
 *
 *  2. `encounter_participants.attacks_used_this_turn` + `.attacks_max_this_turn` —
 *     action economy de Extra Attack. Reset em start-turn;
 *     `attacks_max_this_turn` computado a partir de classes (Fighter L5+=2, L11+=3,
 *     L20=4; Monk L5+=2; Paladin/Barb/Ranger L5+=2; default 1).
 */
export class AddCombatActionRegistryFields1776300000000
  implements MigrationInterface
{
  name = 'AddCombatActionRegistryFields1776300000000';

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
