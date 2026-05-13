import { MigrationInterface, QueryRunner } from "typeorm";


export class SeedFighterSubclassLevels1777040000000 implements MigrationInterface {
  name = "SeedFighterSubclassLevels1777040000000";

  async up(queryRunner: QueryRunner): Promise<void> {

    const [xphb] = (await queryRunner.query(
      `SELECT id FROM comp_sources WHERE code = 'XPHB' LIMIT 1`,
    )) as Array<{ id: string }>;
    if (!xphb) return;

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
