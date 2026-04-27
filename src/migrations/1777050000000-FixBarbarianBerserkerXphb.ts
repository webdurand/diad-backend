import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 012 Barbarian — Fix data 2024 XPHB:
 *
 * 1. Berserker L10 ↔ L14 invertido no DB (ordem 2014 vs 2024 XPHB):
 *    - RAW 2014: L10 Intimidating Presence, L14 Retaliation
 *    - RAW 2024: L10 Retaliation, L14 Intimidating Presence
 *    DB está com a ordem 2014. Swap das 2 level_features rows.
 *
 * 2. Brutal Critical (features 2014 REMOVIDAS em 2024):
 *    `brutal-critical-1-die` (L9), `brutal-critical-2-dice` (L13),
 *    `brutal-critical-3-dice` (L17). 2024 substituiu por Brutal Strike (L9/13/17).
 *    Desvincula features do barbarian base (mantém entradas `features` — podem
 *    ser usadas em seeds 2014 futuros via outra spec).
 */
export class FixBarbarianBerserkerXphb1777050000000 implements MigrationInterface {
  name = "FixBarbarianBerserkerXphb1777050000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // --- Parte 1: Swap Berserker L10 (intimidating-presence) ↔ L14 (retaliation)

    // Remove linkagens erradas
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

    // Adiciona linkagens corretas (RAW 2024)
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

    // --- Parte 2: Desvincula Brutal Critical do barbarian base (L9/13/17)
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
    // Revert Parte 1: volta pra ordem 2014
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

    // Revert Parte 2: relinka Brutal Critical
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
