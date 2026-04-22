import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 012 — Transformation + Summoning pipeline.
 *
 * 2 colunas em encounter_participants que suportam 9+ fontes distintas:
 *
 * - `transformation_state` (JSONB): snapshot do estado original + overlay do
 *   form atual quando o participant est\u00e1 transformado (Wild Shape do Druid,
 *   Polymorph spell, Form of Dread do Warlock Undead, Draconic Transformation
 *   do Sorcerer Draconic, etc). Null = n\u00e3o-transformado.
 *
 * - `linked_caster_participant_id` (varchar): FK pro caster quando este
 *   participant \u00e9 uma cria\u00e7\u00e3o dele (summon, duplicate, illusion).
 *   Permite cleanup em cascata (caster morre \u2192 summons somem) e tracking
 *   de concentra\u00e7\u00e3o compartilhada. Null = participant aut\u00f4nomo.
 */
export class AddTransformationAndCasterLink1777200000000 implements MigrationInterface {
  name = 'AddTransformationAndCasterLink1777200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS transformation_state jsonb DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       ADD COLUMN IF NOT EXISTS linked_caster_participant_id varchar(36) DEFAULT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_encounter_participants_linked_caster
       ON encounter_participants(linked_caster_participant_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_encounter_participants_linked_caster`,
    );
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       DROP COLUMN IF EXISTS linked_caster_participant_id`,
    );
    await queryRunner.query(
      `ALTER TABLE encounter_participants
       DROP COLUMN IF EXISTS transformation_state`,
    );
  }
}
