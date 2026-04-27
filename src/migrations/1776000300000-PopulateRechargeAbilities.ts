import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 004 — Data migration.
 * Varre `monsters.actions` e `monsters.special_abilities` procurando entradas
 * com "(Recharge 5–6)" ou "(Recharge 6)" no nome ou descrição. Garante que o
 * JSON tenha campo `recharge` explícito para ser consumido pelo motor.
 *
 * Idempotente: só seta o campo quando ainda não existe.
 */
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
    // Sem revert — o campo `recharge` enriquecido é benigno; rollback de
    // dados específico não compensa o risco.
  }
}
