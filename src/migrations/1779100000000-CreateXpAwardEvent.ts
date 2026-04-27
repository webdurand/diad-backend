import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 016 M4 — XP award audit log.
 *
 * Cada concessão de XP cria um evento. Sources granulares (RAW 2024 +
 * paridade BG3). Director consulta tabela em memory L4 — "te dei XP
 * por convencer o capitão sem lutar 2 sessões atrás".
 *
 * Ver `specs/016-play-shell-foundation/spec.md` §7.1.
 */
export class CreateXpAwardEvent1779100000000 implements MigrationInterface {
  name = "CreateXpAwardEvent1779100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS xp_award_events (
         id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         character_id              UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
         amount                    INTEGER NOT NULL CHECK (amount >= 0),
         source                    VARCHAR(40) NOT NULL CHECK (source IN (
                                     'combat_kill',
                                     'combat_resolved_peacefully',
                                     'skill_challenge',
                                     'quest_step',
                                     'quest_completion',
                                     'exploration_milestone',
                                     'roleplay'
                                   )),
         reason                    VARCHAR(200) NOT NULL,
         encounter_id              UUID NULL,
         quest_step_id             UUID NULL,
         narrative_justification   TEXT NULL,
         created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_xp_award_events_character
         ON xp_award_events(character_id, created_at DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_xp_award_events_character`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS xp_award_events`);
  }
}
