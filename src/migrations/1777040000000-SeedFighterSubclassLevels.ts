import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 012 Fighter 100% — Data gap: as 3 subclasses Fighter alternativas
 * (fighter-battle-master, fighter-eldritch-knight, fighter-psi-warrior) NÃO
 * têm rows em `levels`. Consequência: level-up.service não acha levelData
 * ao processar L3 e nenhuma feature da subclass é atribuída ao char.
 *
 * Esta migration:
 *  1. Cria 1 level row L3 pra cada subclass (MVP — V2 adiciona L7/10/15/18)
 *  2. Linka as features XPHB L3 da subclass via level_features
 *
 * Subclass features XPHB L3 (feature slug.startsWith('<feature>-fighter-<subclass>-3')):
 *  - Battle Master: battle-master, combat-superiority, maneuver-options
 *  - Eldritch Knight: spellcasting, war-bond (+weapon-bond etc)
 *  - Psi Warrior: protective-field, psionic-power, psionic-strike, telekinetic-movement
 */
export class SeedFighterSubclassLevels1777040000000 implements MigrationInterface {
  name = "SeedFighterSubclassLevels1777040000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // source_id pega o XPHB source
    const [xphb] = (await queryRunner.query(
      `SELECT id FROM comp_sources WHERE code = 'XPHB' LIMIT 1`,
    )) as Array<{ id: string }>;
    if (!xphb) return; // DB sem XPHB — migration no-op

    const fighterClass = (await queryRunner.query(
      `SELECT id FROM classes WHERE slug = 'fighter' AND source_id = $1 LIMIT 1`,
      [xphb.id],
    )) as Array<{ id: string }>;
    if (!fighterClass.length) return;
    const classId = fighterClass[0].id;

    const subclasses = (await queryRunner.query(
      `SELECT id, slug FROM subclasses WHERE slug IN ('fighter-battle-master', 'fighter-eldritch-knight', 'fighter-psi-warrior')`,
    )) as Array<{ id: string; slug: string }>;

    for (const sc of subclasses) {
      // Cria L3 row se não existir
      const existing = (await queryRunner.query(
        `SELECT id FROM levels WHERE subclass_id = $1 AND level = 3 LIMIT 1`,
        [sc.id],
      )) as Array<{ id: string }>;
      let levelId: string;
      if (existing.length) {
        levelId = existing[0].id;
      } else {
        const levelSlug = `${sc.slug}-3`;
        const inserted = (await queryRunner.query(
          `INSERT INTO levels (slug, level, url, ability_score_bonuses, class_id, subclass_id, source_id)
           VALUES ($1, 3, $2, 0, $3, $4, $5)
           RETURNING id`,
          [levelSlug, `/spec-012/${levelSlug}`, classId, sc.id, xphb.id],
        )) as Array<{ id: string }>;
        levelId = inserted[0].id;
      }

      // Linka features L3 da subclass (pelo subclass_id do feature = sc.id)
      await queryRunner.query(
        `INSERT INTO level_features (level_id, feature_id)
         SELECT $1, f.id
         FROM features f
         WHERE f.subclass_id = $2 AND f.level = 3
         AND NOT EXISTS (
           SELECT 1 FROM level_features lf
           WHERE lf.level_id = $1 AND lf.feature_id = f.id
         )`,
        [levelId, sc.id],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM level_features lf
       USING levels l, subclasses s
       WHERE lf.level_id = l.id
       AND l.subclass_id = s.id
       AND s.slug IN ('fighter-battle-master', 'fighter-eldritch-knight', 'fighter-psi-warrior')
       AND l.level = 3`,
    );
    await queryRunner.query(
      `DELETE FROM levels
       WHERE subclass_id IN (
         SELECT id FROM subclasses
         WHERE slug IN ('fighter-battle-master', 'fighter-eldritch-knight', 'fighter-psi-warrior')
       )
       AND level = 3
       AND slug LIKE '%-3'`,
    );
  }
}
