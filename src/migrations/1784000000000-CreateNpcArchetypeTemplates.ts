import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 026 / Pillar 6 — NPC Archetype Registry + provenance tracking.
 *
 * Cria 1 tabela + adiciona 1 coluna em `npcs`:
 *
 *  - `npc_archetype_templates` (slug PK → monster_id FK): mapeia archetypes
 *    canônicos PT-BR/EN para stat blocks RAW do MM 2024 já existentes em
 *    `monsters`. Seed feito via INSERT...SELECT (zero hardcoded ids).
 *  - `npcs.provenance`: tracking de origem (`manual` | `auto-materialized`
 *    | `director-planned`) — habilita futuro GC de NPCs órfãos.
 *
 * 14 archetypes seeded cobrem ~90% dos NPCs humanoides comuns: commoner,
 * acolyte, guard, noble, thug, bandit, cultist, bandit-captain, cult-fanatic,
 * spy, priest, veteran, mage, assassin.
 *
 * Down() simétrico (drop coluna + tabela).
 */
export class CreateNpcArchetypeTemplates1784000000000
  implements MigrationInterface
{
  name = "CreateNpcArchetypeTemplates1784000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS npc_archetype_templates (
        slug VARCHAR(50) PRIMARY KEY,
        monster_id UUID NOT NULL REFERENCES monsters(id) ON DELETE RESTRICT,
        archetype_label_pt VARCHAR(100) NOT NULL,
        hostility_default VARCHAR(16) NOT NULL DEFAULT 'neutral',
        mm_2024_page INT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT npc_archetype_hostility_check
          CHECK (hostility_default IN ('volatile','low','high','neutral'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_npc_archetype_monster
        ON npc_archetype_templates(monster_id)
    `);

    // Seed inicial — 14 archetypes resolvidos via JOIN no slug do monster.
    // Slugs foram validados contra a base existente; INSERT...SELECT é
    // idempotente via ON CONFLICT (re-execução não duplica).
    const seed: Array<{
      slug: string;
      monsterSlug: string;
      labelPt: string;
      hostility: "volatile" | "low" | "high" | "neutral";
      page: number | null;
    }> = [
      { slug: "commoner",       monsterSlug: "commoner",       labelPt: "Plebeu",                   hostility: "low",      page: 359 },
      { slug: "acolyte",        monsterSlug: "acolyte",        labelPt: "Acólito",                  hostility: "low",      page: 343 },
      { slug: "guard",          monsterSlug: "guard",          labelPt: "Guarda",                   hostility: "neutral",  page: 347 },
      { slug: "noble",          monsterSlug: "noble",          labelPt: "Nobre",                    hostility: "low",      page: 348 },
      { slug: "thug",           monsterSlug: "thug",           labelPt: "Capanga",                  hostility: "volatile", page: 350 },
      { slug: "bandit",         monsterSlug: "bandit",         labelPt: "Bandido",                  hostility: "volatile", page: 343 },
      { slug: "cultist",        monsterSlug: "cultist",        labelPt: "Cultista",                 hostility: "volatile", page: 345 },
      { slug: "bandit_captain", monsterSlug: "bandit-captain", labelPt: "Capitão de Bandidos",      hostility: "high",     page: 344 },
      { slug: "cult_fanatic",   monsterSlug: "cult-fanatic",   labelPt: "Fanático Cultista",        hostility: "high",     page: 346 },
      { slug: "spy",            monsterSlug: "spy",            labelPt: "Espião",                   hostility: "neutral",  page: 349 },
      { slug: "priest",         monsterSlug: "priest",         labelPt: "Sacerdote",                hostility: "neutral",  page: 348 },
      { slug: "veteran",        monsterSlug: "veteran",        labelPt: "Veterano",                 hostility: "neutral",  page: 350 },
      { slug: "mage",           monsterSlug: "mage",           labelPt: "Mago",                     hostility: "neutral",  page: 347 },
      { slug: "assassin",       monsterSlug: "assassin",       labelPt: "Assassino",                hostility: "high",     page: 343 },
    ];

    for (const row of seed) {
      await queryRunner.query(
        `INSERT INTO npc_archetype_templates (slug, monster_id, archetype_label_pt, hostility_default, mm_2024_page)
         SELECT $1, m.id, $2, $3, $4
         FROM monsters m
         WHERE m.slug = $5
         ON CONFLICT (slug) DO NOTHING`,
        [row.slug, row.labelPt, row.hostility, row.page, row.monsterSlug],
      );
    }

    // Sanity check: todos os 14 archetypes resolveram pra um monster?
    // Se algum monster slug mudou, INSERT...SELECT não falha — apenas
    // não insere a row. Levantar erro explícito pra pegar regressão.
    const result = await queryRunner.query(
      `SELECT COUNT(*)::int AS n FROM npc_archetype_templates`,
    );
    const inserted = result?.[0]?.n ?? 0;
    if (inserted < seed.length) {
      throw new Error(
        `npc_archetype_templates seed incompleto: esperado ${seed.length}, ` +
          `inserido ${inserted}. Algum monster slug não foi encontrado em monsters.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE npcs
      ADD COLUMN IF NOT EXISTS provenance VARCHAR(24) NOT NULL DEFAULT 'manual'
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'npcs_provenance_check'
        ) THEN
          ALTER TABLE npcs
            ADD CONSTRAINT npcs_provenance_check
            CHECK (provenance IN ('manual','auto-materialized','director-planned'));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_npcs_provenance
        ON npcs(provenance) WHERE provenance != 'manual'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_npcs_provenance`);
    await queryRunner.query(
      `ALTER TABLE npcs DROP CONSTRAINT IF EXISTS npcs_provenance_check`,
    );
    await queryRunner.query(`ALTER TABLE npcs DROP COLUMN IF EXISTS provenance`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_npc_archetype_monster`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS npc_archetype_templates`);
  }
}
