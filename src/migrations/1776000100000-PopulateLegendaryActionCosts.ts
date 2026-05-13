import { MigrationInterface, QueryRunner } from "typeorm";


export class PopulateLegendaryActionCosts1776000100000 implements MigrationInterface {
  name = "PopulateLegendaryActionCosts1776000100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const monsters = await queryRunner.query(`
      SELECT id, slug, legendary_actions
      FROM monsters
      WHERE legendary_actions IS NOT NULL
        AND legendary_actions::text NOT IN ('null', '{}', '[]')
    `);

    for (const m of monsters) {
      const raw = m.legendary_actions;
      const list: Array<{
        name?: string;
        desc?: string;
        description?: string;
      }> = Array.isArray(raw) ? raw : (raw?.actions ?? []);

      const costMap: Record<string, 1 | 2 | 3> = {};
      for (const action of list) {
        const name = action?.name;
        if (!name) continue;
        const text = `${name} ${action?.desc ?? action?.description ?? ""}`;
        if (/\(Costs\s*3\s*Actions?\)/i.test(text)) {
          costMap[name] = 3;
        } else if (/\(Costs\s*2\s*Actions?\)/i.test(text)) {
          costMap[name] = 2;
        } else {
          costMap[name] = 1;
        }
      }

      if (Object.keys(costMap).length > 0) {
        await queryRunner.query(
          `UPDATE monsters SET legendary_action_cost_map = $1 WHERE id = $2`,
          [JSON.stringify(costMap), m.id],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE monsters SET legendary_action_cost_map = NULL`,
    );
  }
}
