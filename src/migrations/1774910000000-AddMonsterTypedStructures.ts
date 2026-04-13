import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds typed structured fields for monster multiattack and spellcasting,
 * plus a per-participant tracker for spell slots consumed in combat.
 *
 * - monsters.multiattack (jsonb, nullable) — shape: MonsterMultiattack
 * - monsters.spellcasting (jsonb, nullable) — shape: MonsterSpellcasting
 * - encounter_participants.spell_slots_used (jsonb, not null, default '{}')
 *
 * Data population happens in sibling migrations
 * PopulateMonsterMultiattackData and PopulateMonsterSpellcastingData.
 */
export class AddMonsterTypedStructures1774910000000 implements MigrationInterface {
  name = 'AddMonsterTypedStructures1774910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE monsters
        ADD COLUMN multiattack jsonb,
        ADD COLUMN spellcasting jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE encounter_participants
        ADD COLUMN spell_slots_used jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE encounter_participants DROP COLUMN spell_slots_used
    `);
    await queryRunner.query(`
      ALTER TABLE monsters
        DROP COLUMN spellcasting,
        DROP COLUMN multiattack
    `);
  }
}
