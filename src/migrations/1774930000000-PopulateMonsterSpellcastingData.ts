import { MigrationInterface, QueryRunner } from 'typeorm';
import { parseSpellcastingFromSpecialAbilities } from './utils/parse-spellcasting';

/**
 * Populates `monsters.spellcasting` for every monster whose `special_abilities`
 * contain a Spellcasting or Innate Spellcasting block. Uses a regex parser
 * over the free-text `desc`. Monsters without a parseable block keep
 * `spellcasting = NULL` (runtime treats them as non-casters).
 *
 * Idempotent: re-running replaces previous values.
 * DOWN: clears all populated rows (preserves schema).
 */
export class PopulateMonsterSpellcastingData1774930000000 implements MigrationInterface {
  name = 'PopulateMonsterSpellcastingData1774930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const monsters: Array<{ id: string; special_abilities: any }> = await queryRunner.query(
      `SELECT id, special_abilities FROM monsters WHERE special_abilities IS NOT NULL`,
    );

    let populated = 0;
    let skipped = 0;

    for (const m of monsters) {
      const parsed = parseSpellcastingFromSpecialAbilities(m.special_abilities);
      if (!parsed) {
        skipped++;
        continue;
      }
      await queryRunner.query(
        `UPDATE monsters SET spellcasting = $1 WHERE id = $2`,
        [JSON.stringify(parsed), m.id],
      );
      populated++;
    }

    // eslint-disable-next-line no-console
    console.log(`[PopulateMonsterSpellcastingData] populated=${populated} skipped=${skipped}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE monsters SET spellcasting = NULL`);
  }
}
