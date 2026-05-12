import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adiciona `rewards` ao CHECK de session_messages.kind. Enum TS
 * (SessionMessageKind) já incluía mas o constraint do Postgres não foi
 * atualizado, causando 23514 ao postar entries de loot/currency.
 */
export class AddRewardsKindToSessionMessages1789500000000 implements MigrationInterface {
  name = "AddRewardsKindToSessionMessages1789500000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE session_messages DROP CONSTRAINT IF EXISTS session_messages_kind_check`,
    );
    await queryRunner.query(`
      ALTER TABLE session_messages ADD CONSTRAINT session_messages_kind_check
      CHECK (kind IN (
        'narration','player_action','system','recap','xp','rest_done',
        'morning_briefing','combat_resolution','dice_roll','choices','rewards'
      ))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE session_messages DROP CONSTRAINT IF EXISTS session_messages_kind_check`,
    );
    await queryRunner.query(`
      ALTER TABLE session_messages ADD CONSTRAINT session_messages_kind_check
      CHECK (kind IN (
        'narration','player_action','system','recap','xp','rest_done',
        'morning_briefing','combat_resolution','dice_roll','choices'
      ))
    `);
  }
}
