import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 012 Paladin — Fix data XPHB 2024:
 *
 * 1. Features 2014 REMOVIDAS em 2024 ainda linkadas no base paladin:
 *    - L11 `improved-divine-smite` (substituído por Radiant Strikes L11)
 *    - L14 `cleansing-touch` (substituído por Restoring Touch L14)
 *
 * 2. Devotion L15 Purity of Spirit é 2014; XPHB 2024 tem Smite of Protection
 *    (feature não presente no DB). Mantém o placeholder — harness valida MVP.
 *
 * Mesmo pattern da gotcha #21 (Barbarian Brutal Critical, Cleric Destroy Undead).
 */
export class FixPaladinXphb1777110000000 implements MigrationInterface {
  name = "FixPaladinXphb1777110000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const slugsToUnlink = ["improved-divine-smite", "cleansing-touch"];

    await queryRunner.query(
      `DELETE FROM level_features
       WHERE level_id IN (
         SELECT l.id FROM levels l
         JOIN classes c ON c.id = l.class_id
         WHERE c.slug = 'paladin' AND l.subclass_id IS NULL
       )
       AND feature_id IN (
         SELECT id FROM features WHERE slug = ANY($1::text[])
       )`,
      [slugsToUnlink],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const mapping: Array<{ slug: string; level: number }> = [
      { slug: "improved-divine-smite", level: 11 },
      { slug: "cleansing-touch", level: 14 },
    ];
    for (const m of mapping) {
      await queryRunner.query(
        `INSERT INTO level_features (level_id, feature_id)
         SELECT l.id, f.id
         FROM levels l
         JOIN classes c ON c.id = l.class_id
         CROSS JOIN features f
         WHERE c.slug = 'paladin' AND l.subclass_id IS NULL
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
