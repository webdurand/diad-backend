import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fighter Battle Master (RAW 2024) — pool de Superiority Dice.
 * RAW: 4 dice @ L3, 5 @ L7, 6 @ L15. Die size: d8 @ L3, d10 @ L10, d12 @ L18.
 * Recharge: 1 die em short rest, todos em long rest.
 *
 * Tracking via encounter_participants (vive dentro do encontro; reset em
 * short/long rest via fluxo dedicado). Inicializa no start-turn com pool
 * atual = pool max se ainda não setado, ou mantém se já consumido.
 */
export class AddSuperiorityDicePool1777030000000 implements MigrationInterface {
  name = 'AddSuperiorityDicePool1777030000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS superiority_dice_used INT NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants DROP COLUMN IF EXISTS superiority_dice_used`,
    );
  }
}
