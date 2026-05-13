import { MigrationInterface, QueryRunner } from "typeorm";


export class FixClericXphb1777080000000 implements MigrationInterface {
  name = "FixClericXphb1777080000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const slugsToUnlink = [
      "destroy-undead-cr-1-2-or-below",
      "destroy-undead-cr-1-or-below",
      "destroy-undead-cr-2-or-below",
      "destroy-undead-cr-3-or-below",
      "destroy-undead-cr-4-or-below",
      "divine-intervention-improvement",
    ];

    await queryRunner.query(
      `DELETE FROM level_features
       WHERE level_id IN (
         SELECT l.id FROM levels l
         JOIN classes c ON c.id = l.class_id
         WHERE c.slug = 'cleric' AND l.subclass_id IS NULL
       )
       AND feature_id IN (
         SELECT id FROM features WHERE slug = ANY($1::text[])
       )`,
      [slugsToUnlink],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const mapping: Array<{ slug: string; level: number }> = [
      { slug: "destroy-undead-cr-1-2-or-below", level: 5 },
      { slug: "destroy-undead-cr-1-or-below", level: 8 },
      { slug: "destroy-undead-cr-2-or-below", level: 11 },
      { slug: "destroy-undead-cr-3-or-below", level: 14 },
      { slug: "destroy-undead-cr-4-or-below", level: 17 },
      { slug: "divine-intervention-improvement", level: 20 },
    ];
    for (const m of mapping) {
      await queryRunner.query(
        `INSERT INTO level_features (level_id, feature_id)
         SELECT l.id, f.id
         FROM levels l
         JOIN classes c ON c.id = l.class_id
         CROSS JOIN features f
         WHERE c.slug = 'cleric' AND l.subclass_id IS NULL
         AND l.level = $1 AND f.slug = $2
         AND NOT EXISTS (
           SELECT 1 FROM level_features lf
           WHERE lf.level_id = l.id AND lf.feature_id = f.id
         )`,
        [m.level, m.slug],
      );
    }
  }
}
