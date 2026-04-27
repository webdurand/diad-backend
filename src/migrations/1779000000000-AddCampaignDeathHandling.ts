import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 016 M0 — Hardcore mode toggle.
 *
 * - death_handling: 'narrative' (default, Fate Ladder full) ou 'hardcore'
 *   (apenas opção A 'Aceitar morte' + reload-save CTA tradicional).
 * - xp_mode: RAW 2024 default + flag por campanha.
 * - Configurado no /jogar/preparar, mutable post-creation com warning.
 *
 * Ver `specs/016-play-shell-foundation/spec.md` §5.6 e §7.1.
 */
export class AddCampaignDeathHandling1779000000000 implements MigrationInterface {
  name = "AddCampaignDeathHandling1779000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE campaigns
       ADD COLUMN IF NOT EXISTS death_handling VARCHAR(20) NOT NULL DEFAULT 'narrative'
         CHECK (death_handling IN ('narrative', 'hardcore')),
       ADD COLUMN IF NOT EXISTS xp_mode VARCHAR(20) NOT NULL DEFAULT 'rules'
         CHECK (xp_mode IN ('rules', 'milestone', 'hybrid'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE campaigns
       DROP COLUMN IF EXISTS xp_mode,
       DROP COLUMN IF EXISTS death_handling`,
    );
  }
}
