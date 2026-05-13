import { MigrationInterface, QueryRunner } from "typeorm";


export class PopulateRechargeAbilities1776000300000 implements MigrationInterface {
  name = "PopulateRechargeAbilities1776000300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const monsters = await queryRunner.query(`
      SELECT id, slug, actions, special_abilities
      FROM monsters
      WHERE actions IS NOT NULL OR special_abilities IS NOT NULL
    `);

    const detectRecharge = (text: string): "5-6" | "6" | null => {
      if (/\(Recharge\s*5\s*[\u2013\u2014\-]\s*6\)/i.test(text)) return "5-6";
      if (/\(Recharge\s*5-6\)/i.test(text)) return "5-6";
      if (/\(Recharge\s*6\)/i.test(text)) return "6";
      return null;
    };

    const enrich = (list: unknown): { changed: boolean; result: unknown[] } => {
      if (!Array.isArray(list)) return { changed: false, result: [] };
      let changed = false;
      const result = list.map((entry) => {
        if (!entry || typeof entry !== "object") return entry;
        const e = entry as Record<string, unknown>;
        if (e.recharge) return e;
        const text = `${String(e.name ?? "")} ${String(e.desc ?? e.description ?? "")}`;
        const rec = detectRecharge(text);
        if (rec) {
          changed = true;
          return { ...e, recharge: rec };
        }
        return e;
      });
      return { changed, result };
    };

    for (const m of monsters) {
      let needsUpdate = false;
      let actions = m.actions;
      let special = m.special_abilities;

      const a = enrich(actions);
      if (a.changed) {
        actions = a.result;
        needsUpdate = true;
      }
      const s = enrich(special);
      if (s.changed) {
        special = s.result;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await queryRunner.query(
          `UPDATE monsters SET actions = $1, special_abilities = $2 WHERE id = $3`,
          [JSON.stringify(actions), JSON.stringify(special), m.id],
        );
      }
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {


  }
}
