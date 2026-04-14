import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 003: adiciona flag `controlled_by` ('human'|'ai'|'dm') + estados de ações
 * genéricas (Dodge/Help/Ready) + cache de idempotência para `/ai-turn`.
 *
 * Backfill: monstros e NPCs passam a ser controlados pelo DM (`controlled_by='dm'`);
 * PCs ficam com o default `'human'`. Encontros em andamento não quebram.
 */
export class AddControlAndReactionsToParticipant1775000000000
  implements MigrationInterface
{
  name = 'AddControlAndReactionsToParticipant1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE encounter_participants
        ADD COLUMN controlled_by varchar(8) NOT NULL DEFAULT 'human',
        ADD COLUMN dodging_until_turn_of_participant_id varchar(36) NULL,
        ADD COLUMN helping_ally_participant_id varchar(36) NULL,
        ADD COLUMN helping_target_participant_id varchar(36) NULL,
        ADD COLUMN helping_until_turn_of_participant_id varchar(36) NULL,
        ADD COLUMN readied_action jsonb NULL,
        ADD COLUMN last_ai_turn_round int NULL,
        ADD COLUMN last_ai_turn_result jsonb NULL
    `);

    await queryRunner.query(`
      ALTER TABLE encounter_participants
        ADD CONSTRAINT chk_controlled_by
        CHECK (controlled_by IN ('human', 'ai', 'dm'))
    `);

    // Backfill: monstros e NPCs sob controle do DM por default.
    await queryRunner.query(`
      UPDATE encounter_participants
         SET controlled_by = 'dm'
       WHERE type IN ('monster', 'npc')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE encounter_participants DROP CONSTRAINT IF EXISTS chk_controlled_by
    `);
    await queryRunner.query(`
      ALTER TABLE encounter_participants
        DROP COLUMN IF EXISTS controlled_by,
        DROP COLUMN IF EXISTS dodging_until_turn_of_participant_id,
        DROP COLUMN IF EXISTS helping_ally_participant_id,
        DROP COLUMN IF EXISTS helping_target_participant_id,
        DROP COLUMN IF EXISTS helping_until_turn_of_participant_id,
        DROP COLUMN IF EXISTS readied_action,
        DROP COLUMN IF EXISTS last_ai_turn_round,
        DROP COLUMN IF EXISTS last_ai_turn_result
    `);
  }
}
