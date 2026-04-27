import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 013 — Backfill ground-effect spells em E2E chars existentes.
 *
 * Problema: chars E2E (wizard-L5-*, druid-L20-*, cleric-L5-*, etc.) foram
 * seedados via CLASS_SPELL_DEFAULTS pré-013, sem grease/web/spike-growth/
 * wall-of-fire/cloud-of-daggers/sleet-storm/spirit-guardians no spellbook.
 *
 * castSpellInCombat valida spellbook (`charSpellRef = sheet.spells.find(...)`)
 * → cast falha com INVALID_ACTION pra magias spec 013 nesses chars.
 *
 * Esta migration adiciona as magias missing em todos os chars cuja name match
 * o pattern de classe (`{class}-L%-*`). Idempotente via NOT EXISTS.
 *
 * Idempotente. Safe pra rodar em prod (NOT EXISTS evita duplicate insert).
 * Sem risco em chars de produção: só atua em chars que JÁ TÊM linhas em
 * character_spells (não cria entry vazio); a magia adicionada vira
 * status='prepared' source='class' — exatamente o que o seed-character faz.
 */
export class Spec013BackfillSpellbooks1780100000000 implements MigrationInterface {
  name = "Spec013BackfillSpellbooks1780100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Mapping: pattern do nome → slugs de magia spec 013 a adicionar
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
        // INSERT char_spells (character_id, spell_id, source, status) SELECT
        // FROM characters c CROSS JOIN spells s WHERE c.name LIKE pattern
        // AND s.slug = slug AND NOT EXISTS (already linked).
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
    // Best-effort revert: remove spec 013 spells de chars que match pattern.
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
