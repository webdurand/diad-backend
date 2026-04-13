import { MigrationInterface, QueryRunner } from 'typeorm';
import { parseMultiattackFromDescription } from './utils/parse-multiattack';

/**
 * Populates `monsters.multiattack` for every monster whose `actions` array
 * contains a "Multiattack" entry. Uses a regex-based parser over the free-text
 * `desc`. Monsters whose multiattack text cannot be parsed are left with
 * `multiattack = NULL` (the runtime falls back to "no multiattack available").
 *
 * Idempotent: re-running replaces previous values.
 * DOWN: clears all populated rows (preserves schema).
 */
export class PopulateMonsterMultiattackData1774920000000 implements MigrationInterface {
  name = 'PopulateMonsterMultiattackData1774920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const monsters: Array<{ id: string; actions: any }> = await queryRunner.query(
      `SELECT id, actions FROM monsters WHERE actions IS NOT NULL`,
    );

    let populated = 0;
    let skipped = 0;

    for (const m of monsters) {
      const actions = Array.isArray(m.actions) ? m.actions : [];
      const multiattackAction = actions.find(
        (a: any) => typeof a?.name === 'string' && /multiattack/i.test(a.name),
      );
      if (!multiattackAction) {
        skipped++;
        continue;
      }

      const desc = typeof multiattackAction.desc === 'string' ? multiattackAction.desc : '';
      const parsed = parseMultiattackFromDescription(desc, actions);
      if (!parsed) {
        skipped++;
        continue;
      }

      await queryRunner.query(
        `UPDATE monsters SET multiattack = $1 WHERE id = $2`,
        [JSON.stringify(parsed), m.id],
      );
      populated++;
    }

    // eslint-disable-next-line no-console
    console.log(`[PopulateMonsterMultiattackData] populated=${populated} skipped=${skipped}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE monsters SET multiattack = NULL`);
  }
}
