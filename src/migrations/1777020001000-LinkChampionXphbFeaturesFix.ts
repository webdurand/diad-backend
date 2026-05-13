import { MigrationInterface, QueryRunner } from "typeorm";


export class LinkChampionXphbFeaturesFix1777020001000 implements MigrationInterface {
  name = "LinkChampionXphbFeaturesFix1777020001000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const featureToLevel: Array<{ slug: string; level: number }> = [
      { slug: "remarkable-athlete-fighter-champion-3", level: 3 },
      { slug: "heroic-warrior-fighter-champion-10", level: 10 },
      { slug: "survivor-fighter-champion-18", level: 18 },
    ];

    for (const ft of featureToLevel) {
      await queryRunner.query(
        `INSERT INTO level_features (level_id, feature_id)
         SELECT l.id, f.id
         FROM levels l
         JOIN subclasses s ON s.id = l.subclass_id
         CROSS JOIN features f
         WHERE s.slug = 'champion' AND l.level = $2 AND f.slug = $1
         AND NOT EXISTS (
           SELECT 1 FROM level_features lf
           WHERE lf.level_id = l.id AND lf.feature_id = f.id
         )`,
        [ft.slug, ft.level],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const featureToLevel: Array<{ slug: string; level: number }> = [
      { slug: "remarkable-athlete-fighter-champion-3", level: 3 },
      { slug: "heroic-warrior-fighter-champion-10", level: 10 },
      { slug: "survivor-fighter-champion-18", level: 18 },
    ];

    for (const ft of featureToLevel) {
      await queryRunner.query(
        `DELETE FROM level_features
         WHERE level_id IN (
           SELECT l.id FROM levels l JOIN subclasses s ON s.id = l.subclass_id
           WHERE s.slug = 'champion' AND l.level = $1
         )
         AND feature_id IN (SELECT id FROM features WHERE slug = $2)`,
        [ft.level, ft.slug],
      );
    }
  }
}
