import { MigrationInterface, QueryRunner } from "typeorm";


export class FixBarbarianBerserkerXphb1777050000000 implements MigrationInterface {
  name = "FixBarbarianBerserkerXphb1777050000000";

  async up(queryRunner: QueryRunner): Promise<void> {



    await queryRunner.query(
      `DELETE FROM level_features
       WHERE level_id IN (
         SELECT l.id FROM levels l
         JOIN subclasses s ON s.id = l.subclass_id
         WHERE s.slug = 'berserker' AND l.level = 10
       )
       AND feature_id IN (SELECT id FROM features WHERE slug = 'intimidating-presence')`,
    );
    await queryRunner.query(
      `DELETE FROM level_features
       WHERE level_id IN (
         SELECT l.id FROM levels l
         JOIN subclasses s ON s.id = l.subclass_id
         WHERE s.slug = 'berserker' AND l.level = 14
       )
       AND feature_id IN (SELECT id FROM features WHERE slug = 'retaliation')`,
    );


    await queryRunner.query(
      `INSERT INTO level_features (level_id, feature_id)
       SELECT l.id, f.id
       FROM levels l
       JOIN subclasses s ON s.id = l.subclass_id
       CROSS JOIN features f
       WHERE s.slug = 'berserker' AND l.level = 10 AND f.slug = 'retaliation'
       AND NOT EXISTS (
         SELECT 1 FROM level_features lf
         WHERE lf.level_id = l.id AND lf.feature_id = f.id
       )`,
    );
    await queryRunner.query(
      `INSERT INTO level_features (level_id, feature_id)
       SELECT l.id, f.id
       FROM levels l
       JOIN subclasses s ON s.id = l.subclass_id
       CROSS JOIN features f
       WHERE s.slug = 'berserker' AND l.level = 14 AND f.slug = 'intimidating-presence'
       AND NOT EXISTS (
         SELECT 1 FROM level_features lf
         WHERE lf.level_id = l.id AND lf.feature_id = f.id
       )`,
    );


    await queryRunner.query(
      `DELETE FROM level_features
       WHERE level_id IN (
         SELECT l.id FROM levels l
         JOIN classes c ON c.id = l.class_id
         WHERE c.slug = 'barbarian' AND l.subclass_id IS NULL
         AND l.level IN (9, 13, 17)
       )
       AND feature_id IN (
         SELECT id FROM features
         WHERE slug IN ('brutal-critical-1-die', 'brutal-critical-2-dice', 'brutal-critical-3-dice')
       )`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query(
      `DELETE FROM level_features
       WHERE level_id IN (
         SELECT l.id FROM levels l
         JOIN subclasses s ON s.id = l.subclass_id
         WHERE s.slug = 'berserker' AND l.level = 10
       )
       AND feature_id IN (SELECT id FROM features WHERE slug = 'retaliation')`,
    );
    await queryRunner.query(
      `DELETE FROM level_features
       WHERE level_id IN (
         SELECT l.id FROM levels l
         JOIN subclasses s ON s.id = l.subclass_id
         WHERE s.slug = 'berserker' AND l.level = 14
       )
       AND feature_id IN (SELECT id FROM features WHERE slug = 'intimidating-presence')`,
    );
    await queryRunner.query(
      `INSERT INTO level_features (level_id, feature_id)
       SELECT l.id, f.id
       FROM levels l
       JOIN subclasses s ON s.id = l.subclass_id
       CROSS JOIN features f
       WHERE s.slug = 'berserker' AND l.level = 10 AND f.slug = 'intimidating-presence'
       AND NOT EXISTS (
         SELECT 1 FROM level_features lf
         WHERE lf.level_id = l.id AND lf.feature_id = f.id
       )`,
    );
    await queryRunner.query(
      `INSERT INTO level_features (level_id, feature_id)
       SELECT l.id, f.id
       FROM levels l
       JOIN subclasses s ON s.id = l.subclass_id
       CROSS JOIN features f
       WHERE s.slug = 'berserker' AND l.level = 14 AND f.slug = 'retaliation'
       AND NOT EXISTS (
         SELECT 1 FROM level_features lf
         WHERE lf.level_id = l.id AND lf.feature_id = f.id
       )`,
    );


    await queryRunner.query(
      `INSERT INTO level_features (level_id, feature_id)
       SELECT l.id, f.id
       FROM levels l
       JOIN classes c ON c.id = l.class_id
       CROSS JOIN features f
       WHERE c.slug = 'barbarian' AND l.subclass_id IS NULL
       AND ((l.level = 9 AND f.slug = 'brutal-critical-1-die')
         OR (l.level = 13 AND f.slug = 'brutal-critical-2-dice')
         OR (l.level = 17 AND f.slug = 'brutal-critical-3-dice'))
       AND NOT EXISTS (
         SELECT 1 FROM level_features lf
         WHERE lf.level_id = l.id AND lf.feature_id = f.id
       )`,
    );
  }
}
