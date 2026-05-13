import { MigrationInterface, QueryRunner } from "typeorm";


export class CreateSessionMessages1781000000000 implements MigrationInterface {
  name = "CreateSessionMessages1781000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        character_id UUID NULL,
        kind VARCHAR NOT NULL,
        content TEXT NOT NULL,
        sequence_number INT NOT NULL,
        client_id VARCHAR NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT session_messages_kind_check CHECK (kind IN (
          'narration','player_action','system','recap','xp','rest_done',
          'morning_briefing','combat_resolution','dice_roll','choices'
        ))
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_session_messages_session_seq
         ON session_messages(session_id, sequence_number)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_session_messages_session_client
         ON session_messages(session_id, client_id)
         WHERE client_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_session_messages_session_id
         ON session_messages(session_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_session_messages_user_id
         ON session_messages(user_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_session_messages_user_id`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_session_messages_session_id`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_session_messages_session_client`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_session_messages_session_seq`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS session_messages`);
  }
}
