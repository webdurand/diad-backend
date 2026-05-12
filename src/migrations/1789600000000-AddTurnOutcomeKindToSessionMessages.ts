import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adiciona `turn_outcome` ao CHECK de session_messages.kind para persistir
 * canon beats do turno: quest update, fato aprendido, recurso alterado,
 * viagem disponível/bloqueada e vitória de campanha.
 */
export class AddTurnOutcomeKindToSessionMessages1789600000000
  implements MigrationInterface
{
  name = "AddTurnOutcomeKindToSessionMessages1789600000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE session_messages DROP CONSTRAINT IF EXISTS session_messages_kind_check`,
    );
    await queryRunner.query(`
      ALTER TABLE session_messages ADD CONSTRAINT session_messages_kind_check
      CHECK (kind IN (
        'narration','player_action','system','recap','xp','rest_done',
        'morning_briefing','combat_resolution','dice_roll','choices','rewards',
        'turn_outcome'
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
        'morning_briefing','combat_resolution','dice_roll','choices','rewards'
      ))
    `);
  }
}
