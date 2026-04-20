import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 012 Fighter 100% — Data gap: features XPHB da subclass Champion existem
 * na tabela `features` mas não estão linkadas a `level_features`. Char L15 com
 * Champion não recebe `remarkable-athlete-fighter-champion-3`,
 * `heroic-warrior-fighter-champion-10` nem `survivor-fighter-champion-18`.
 *
 * Esta migration insere os links faltantes. Idempotente via WHERE NOT EXISTS.
 */
export class LinkChampionXphbFeatures1777020000000 implements MigrationInterface {
  name = 'LinkChampionXphbFeatures1777020000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Para cada feature XPHB Champion, insere em level_features se ainda não existe
    const featureToLevel: Array<{ slug: string; level: number }> = [
      { slug: 'remarkable-athlete-fighter-champion-3', level: 3 },
      { slug: 'heroic-warrior-fighter-champion-10', level: 10 },
      { slug: 'survivor-fighter-champion-18', level: 18 },
    ];

    // As features XPHB estão registradas em `features` com subclass_id da
    // subclass 'fighter-champion', mas o harness usa subclass 'champion'
    // (ambas canonical no DB). Inserir link direto entre o level da subclass
    // 'champion' e a feature pelo slug, ignorando o subclass_id do feature.
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
      { slug: 'remarkable-athlete-fighter-champion-3', level: 3 },
      { slug: 'heroic-warrior-fighter-champion-10', level: 10 },
      { slug: 'survivor-fighter-champion-18', level: 18 },
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
