import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Big-bang refactor: separa Mundo (Campaign) de Aventura (GameSession).
 *
 * Estado mutável de jogo (clocks, quests, vows, narrative_decisions, NPCs auto)
 * passa a ser session-scoped. Identidade do mundo (locations, factions identity,
 * NPCs canônicos, story arcs templates) permanece campaign-scoped.
 *
 * Tabelas mistas (NPC, Faction, StoryArc) são divididas: ficha canônica fica
 * na tabela original; estado mutável vai pra tabela ponte session_<x>_state.
 *
 * Sem migração de dados — limpa tudo afetado e recria.
 */
export class BigBangAdventureScope1789000000000 implements MigrationInterface {
  name = "BigBangAdventureScope1789000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Limpa tudo que depende dos schemas antigos.
    //    Clocks (tensão) ficam de fora — não migram nesta refactor.
    await queryRunner.query(`
      TRUNCATE TABLE
        narrative_decisions,
        vows,
        quest_prerequisites,
        quest_objectives,
        quests,
        npc_relationships,
        faction_relations,
        story_arcs,
        factions,
        npcs
      RESTART IDENTITY CASCADE
    `);

    // 3) quests: campaign_id -> game_session_id (+ unique slug per session)
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_quests_main_per_campaign
    `);
    await queryRunner.query(`
      ALTER TABLE quests DROP CONSTRAINT IF EXISTS "UQ_quests_campaign_slug"
    `);
    await queryRunner.query(`
      ALTER TABLE quests DROP CONSTRAINT IF EXISTS "FK_quests_campaign_id"
    `);
    await queryRunner.query(`
      ALTER TABLE quests DROP COLUMN IF EXISTS campaign_id
    `);
    await queryRunner.query(`
      ALTER TABLE quests ADD COLUMN game_session_id uuid NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE quests ADD CONSTRAINT "FK_quests_game_session_id"
        FOREIGN KEY (game_session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_quests_game_session_id" ON quests(game_session_id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_quests_session_slug" ON quests(game_session_id, slug)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_quests_main_per_session
        ON quests (game_session_id) WHERE is_main_quest = true
    `);

    // 4) vows: campaign_id -> game_session_id
    await queryRunner.query(`
      ALTER TABLE vows DROP CONSTRAINT IF EXISTS "FK_vows_campaign_id"
    `);
    await queryRunner.query(`
      ALTER TABLE vows DROP COLUMN IF EXISTS campaign_id
    `);
    await queryRunner.query(`
      ALTER TABLE vows ADD COLUMN game_session_id uuid NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE vows ADD CONSTRAINT "FK_vows_game_session_id"
        FOREIGN KEY (game_session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_vows_game_session_id" ON vows(game_session_id)
    `);

    // 5) narrative_decisions: drop campaign_id, session_id passa a NOT NULL.
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_narrative_decisions_campaign_id_created_at"
    `);
    await queryRunner.query(`
      ALTER TABLE narrative_decisions DROP CONSTRAINT IF EXISTS "FK_narrative_decisions_campaign_id"
    `);
    await queryRunner.query(`
      ALTER TABLE narrative_decisions DROP COLUMN IF EXISTS campaign_id
    `);
    await queryRunner.query(`
      ALTER TABLE narrative_decisions ALTER COLUMN session_id SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_narrative_decisions_session_created_at"
        ON narrative_decisions(session_id, created_at)
    `);

    // 6) npcs: + game_session_id (nullable: NULL = canônico, set = auto-materializado).
    //    Drop colunas mutáveis (vão pra session_npc_state).
    await queryRunner.query(`
      ALTER TABLE npcs DROP COLUMN IF EXISTS status
    `);
    await queryRunner.query(`
      ALTER TABLE npcs DROP COLUMN IF EXISTS disposition
    `);
    await queryRunner.query(`
      ALTER TABLE npcs DROP COLUMN IF EXISTS current_location_id
    `);
    await queryRunner.query(`
      ALTER TABLE npcs ADD COLUMN game_session_id uuid
    `);
    await queryRunner.query(`
      ALTER TABLE npcs ADD CONSTRAINT "FK_npcs_game_session_id"
        FOREIGN KEY (game_session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_npcs_game_session_id" ON npcs(game_session_id)
    `);

    // 7) factions: drop is_known_to_party (vai pra session_faction_state).
    await queryRunner.query(`
      ALTER TABLE factions DROP COLUMN IF EXISTS is_known_to_party
    `);

    // 8) story_arcs: drop current_phase + phase_notes (vão pra session_story_arc_state).
    await queryRunner.query(`
      ALTER TABLE story_arcs DROP COLUMN IF EXISTS current_phase
    `);
    await queryRunner.query(`
      ALTER TABLE story_arcs DROP COLUMN IF EXISTS phase_notes
    `);

    // 9) Tabelas ponte (estado por aventura).
    await queryRunner.query(`
      CREATE TABLE session_npc_state (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        game_session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
        npc_id uuid NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
        status varchar NOT NULL DEFAULT 'alive',
        disposition varchar NOT NULL DEFAULT 'neutral',
        current_location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_session_npc_state_session_npc" UNIQUE (game_session_id, npc_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_session_npc_state_session" ON session_npc_state(game_session_id)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_session_npc_state_npc" ON session_npc_state(npc_id)
    `);

    await queryRunner.query(`
      CREATE TABLE session_faction_state (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        game_session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
        faction_id uuid NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
        is_known_to_party boolean NOT NULL DEFAULT false,
        disposition varchar NOT NULL DEFAULT 'neutral',
        reputation int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_session_faction_state_session_faction" UNIQUE (game_session_id, faction_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_session_faction_state_session" ON session_faction_state(game_session_id)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_session_faction_state_faction" ON session_faction_state(faction_id)
    `);

    await queryRunner.query(`
      CREATE TABLE session_story_arc_state (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        game_session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
        story_arc_id uuid NOT NULL REFERENCES story_arcs(id) ON DELETE CASCADE,
        current_phase varchar NOT NULL DEFAULT 'hook',
        phase_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_session_story_arc_state_session_arc" UNIQUE (game_session_id, story_arc_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_session_story_arc_state_session" ON session_story_arc_state(game_session_id)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_session_story_arc_state_arc" ON session_story_arc_state(story_arc_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Down não restaura dados (mantemos coerente com "big bang sem migração de dados").
    await queryRunner.query(`DROP TABLE IF EXISTS session_story_arc_state`);
    await queryRunner.query(`DROP TABLE IF EXISTS session_faction_state`);
    await queryRunner.query(`DROP TABLE IF EXISTS session_npc_state`);

    await queryRunner.query(`
      ALTER TABLE story_arcs ADD COLUMN current_phase varchar NOT NULL DEFAULT 'hook'
    `);
    await queryRunner.query(`
      ALTER TABLE story_arcs ADD COLUMN phase_notes jsonb NOT NULL DEFAULT '{}'::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE factions ADD COLUMN is_known_to_party boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_npcs_game_session_id"`);
    await queryRunner.query(`
      ALTER TABLE npcs DROP CONSTRAINT IF EXISTS "FK_npcs_game_session_id"
    `);
    await queryRunner.query(
      `ALTER TABLE npcs DROP COLUMN IF EXISTS game_session_id`,
    );
    await queryRunner.query(`
      ALTER TABLE npcs ADD COLUMN status varchar NOT NULL DEFAULT 'alive'
    `);
    await queryRunner.query(`
      ALTER TABLE npcs ADD COLUMN disposition varchar NOT NULL DEFAULT 'neutral'
    `);
    await queryRunner.query(`
      ALTER TABLE npcs ADD COLUMN current_location_id uuid REFERENCES locations(id) ON DELETE SET NULL
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_narrative_decisions_session_created_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE narrative_decisions ALTER COLUMN session_id DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE narrative_decisions ADD COLUMN campaign_id uuid`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vows_game_session_id"`);
    await queryRunner.query(
      `ALTER TABLE vows DROP CONSTRAINT IF EXISTS "FK_vows_game_session_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE vows DROP COLUMN IF EXISTS game_session_id`,
    );
    await queryRunner.query(`ALTER TABLE vows ADD COLUMN campaign_id uuid`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_quests_main_per_session`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_quests_session_slug"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_quests_game_session_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE quests DROP CONSTRAINT IF EXISTS "FK_quests_game_session_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE quests DROP COLUMN IF EXISTS game_session_id`,
    );
    await queryRunner.query(`ALTER TABLE quests ADD COLUMN campaign_id uuid`);
  }
}
