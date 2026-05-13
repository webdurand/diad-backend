import { MigrationInterface, QueryRunner } from "typeorm";


export class Spec013BackfillSpellbooks1780100000000 implements MigrationInterface {
  name = "Spec013BackfillSpellbooks1780100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {

    const mappings: Array<{ pattern: string; slugs: string[] }> = [
      {
        pattern: "wizard-L%",
        slugs: [
          "grease",
          "web",
          "cloud-of-daggers",
          "sleet-storm",
          "wall-of-fire",
        ],
      },
      {
        pattern: "druid-L%",
        slugs: ["spike-growth", "sleet-storm", "wall-of-fire"],
      },
      {
        pattern: "cleric-L%",
        slugs: ["spirit-guardians"],
      },
      {
        pattern: "ranger-L%",
        slugs: ["spike-growth"],
      },
    ];

    for (const { pattern, slugs } of mappings) {
      for (const slug of slugs) {



        await queryRunner.query(
          `
          INSERT INTO character_spells (character_id, spell_id, source, status, always_prepared)
          SELECT c.id, s.id, 'class', 'prepared', false
          FROM characters c
          CROSS JOIN spells s
          WHERE c.name LIKE $1
            AND s.slug = $2
            AND NOT EXISTS (
              SELECT 1 FROM character_spells cs
              WHERE cs.character_id = c.id AND cs.spell_id = s.id
            )
          `,
          [pattern, slug],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {

    const mappings: Array<{ pattern: string; slugs: string[] }> = [
      {
        pattern: "wizard-L%",
        slugs: [
          "grease",
          "web",
          "cloud-of-daggers",
          "sleet-storm",
          "wall-of-fire",
        ],
      },
      {
        pattern: "druid-L%",
        slugs: ["spike-growth", "sleet-storm", "wall-of-fire"],
      },
      { pattern: "cleric-L%", slugs: ["spirit-guardians"] },
      { pattern: "ranger-L%", slugs: ["spike-growth"] },
    ];
    for (const { pattern, slugs } of mappings) {
      for (const slug of slugs) {
        await queryRunner.query(
          `
          DELETE FROM character_spells cs
          USING characters c, spells s
          WHERE cs.character_id = c.id
            AND cs.spell_id = s.id
            AND c.name LIKE $1
            AND s.slug = $2
            AND cs.source = 'class'
          `,
          [pattern, slug],
        );
      }
    }
  }
}
