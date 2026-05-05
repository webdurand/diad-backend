import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * NPC wealth híbrido: tier enum default cobre 80% dos NPCs anônimos +
 * treasure/currency JSONB pros nomeados (mercadores, quest-givers).
 *
 * Estende `session_npc_state` (mutável por sessão) — NÃO toca `npcs`
 * canônico (Big Bang preserva a separação ficha vs estado).
 *
 * Foundation pra theft tools (steal_from_npc / npc_steals_from_pc) +
 * futuro vendor/merchant. NPCs antigos reuse default ('modest', [], zeros).
 *
 * Down() simétrico.
 */
export class AddSessionNpcWealth1789300000000 implements MigrationInterface {
  name = "AddSessionNpcWealth1789300000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "session_npc_state"
      ADD COLUMN IF NOT EXISTS "wealth_tier" varchar(16)
        NOT NULL DEFAULT 'modest'
    `);
    await queryRunner.query(`
      ALTER TABLE "session_npc_state"
      ADD CONSTRAINT "session_npc_state_wealth_tier_check"
        CHECK ("wealth_tier" IN ('destitute', 'poor', 'modest', 'wealthy', 'noble'))
    `);

    await queryRunner.query(`
      ALTER TABLE "session_npc_state"
      ADD COLUMN IF NOT EXISTS "treasure" jsonb
        NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "session_npc_state"
      ADD COLUMN IF NOT EXISTS "currency" jsonb
        NOT NULL DEFAULT '{"cp":0,"sp":0,"gp":0,"pp":0}'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "session_npc_state" DROP CONSTRAINT IF EXISTS "session_npc_state_wealth_tier_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_npc_state" DROP COLUMN IF EXISTS "wealth_tier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_npc_state" DROP COLUMN IF EXISTS "treasure"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_npc_state" DROP COLUMN IF EXISTS "currency"`,
    );
  }
}
