import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 012 Cleric — Data gap: subclasses alternativas Light/Trickery/War
 * (slug com prefixo `cleric-`) existem mas NÃO têm rows em `levels`. Só a
 * canonical `life` tem level rows (L1/L2/L6/L8/L17 com 6 features).
 *
 * Esta migration cria L3 rows pras 3 alt subclasses + linka features XPHB L3
 * da subclass. Knowledge (cleric-knowledge-frhof) fica fora (é FR/Forgotten
 * Realms variant, não XPHB canonical).
 *
 * Features XPHB L3 esperadas (serão linkadas se existirem em `features`):
 *  - Light: warding-flare, radiance-of-the-dawn
 *  - Trickery: blessing-of-the-trickster, invoke-duplicity
 *  - War: war-priest, guided-strike
 */
export class SeedClericSubclassLevels1777090000000 implements MigrationInterface {
  name = "SeedClericSubclassLevels1777090000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const [xphb] = (await queryRunner.query(
      `SELECT id FROM comp_sources WHERE code = 'XPHB' LIMIT 1`,
    )) as Array<{ id: string }>;
    if (!xphb) return;

    const clericClass = (await queryRunner.query(
      `SELECT id FROM classes WHERE slug = 'cleric' AND source_id = $1 LIMIT 1`,
      [xphb.id],
    )) as Array<{ id: string }>;
    if (!clericClass.length) return;
    const classId = clericClass[0].id;

    const subclasses = (await queryRunner.query(
      `SELECT id, slug FROM subclasses
       WHERE slug IN ('cleric-light', 'cleric-trickery', 'cleric-war')`,
    )) as Array<{ id: string; slug: string }>;

    for (const sc of subclasses) {
      // L3 row
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

      // Linka features L3 pelo subclass_id do feature
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
       AND s.slug IN ('cleric-light', 'cleric-trickery', 'cleric-war')
       AND l.level = 3`,
    );
    await queryRunner.query(
      `DELETE FROM levels
       WHERE subclass_id IN (
         SELECT id FROM subclasses
         WHERE slug IN ('cleric-light', 'cleric-trickery', 'cleric-war')
       )
       AND level = 3
       AND slug LIKE '%-3'`,
    );
  }
}
