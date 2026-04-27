import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 012 Sorcerer Font of Magic — campo `sorcery_points_used` em
 * encounter_participants pra trackear quantos SP foram gastos desde o último
 * long rest. Sorcery Points pool total = sorcerer class level (L1=2, L2=2,
 * L3=3, ..., L20=20). Used +='cost do metamagic ou convert-to-slot'.
 *
 * RAW XPHB 2024:
 * - L1: pool = 0 (Innate Sorcery não usa SP diretamente)
 * - L2+: pool = classLevel (cap 20)
 * - Reset: full em long rest. L5 Sorcerous Restoration: 1/LR regain
 *   floor(max/2) em short rest.
 */
export class AddSorceryPointsUsed1777140000000 implements MigrationInterface {
  name = "AddSorceryPointsUsed1777140000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS sorcery_points_used integer NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants DROP COLUMN IF EXISTS sorcery_points_used`,
    );
  }
}
