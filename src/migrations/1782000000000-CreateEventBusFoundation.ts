import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 017 — World–Encounter–Narrative Bridge Foundation (M1).
 *
 * Estende `session_events` com colunas cross-domain (eventCategory, audiences,
 * traceId, version, aggregateId — ADR-017 future-proofing) e cria 4 tabelas
 * suporte do EventBus:
 *
 *  - audience_routing: matriz default (eventCategory, eventType) → defaultAudiences[]
 *  - campaign_audience_overrides: per-campaign overrides em cima dos defaults
 *  - event_subscribers: registry pra listeners dinâmicos (spec 022)
 *  - event_listener_processed: idempotência (ADR-017 prática 4)
 *
 * Migration semi-aditiva — colunas novas em session_events são NULL/default-friendly,
 * não force backfill em rows antigas. Down() simétrico (drop colunas + tabelas).
 */
export class CreateEventBusFoundation1782000000000 implements MigrationInterface {
  name = "CreateEventBusFoundation1782000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Estende session_events com colunas cross-domain.
    await queryRunner.query(`
      ALTER TABLE session_events
      ADD COLUMN IF NOT EXISTS event_category VARCHAR(20) NULL,
      ADD COLUMN IF NOT EXISTS event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS audiences TEXT[] NOT NULL DEFAULT '{}'::text[],
      ADD COLUMN IF NOT EXISTS trace_id VARCHAR(32) NULL,
      ADD COLUMN IF NOT EXISTS span_id VARCHAR(16) NULL,
      ADD COLUMN IF NOT EXISTS narrative_descriptor VARCHAR(120) NULL,
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS aggregate_id UUID NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'session_events_event_category_check'
        ) THEN
          ALTER TABLE session_events
            ADD CONSTRAINT session_events_event_category_check
            CHECK (event_category IS NULL OR event_category IN (
              'EncounterEvent','WorldEvent','NarrativeEvent','SocialEvent'
            ));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_session_events_session_category_seq
        ON session_events(session_id, event_category, sequence)
    `);

    // 2. audience_routing — matriz default global (campaign-agnostic).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audience_routing (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_category VARCHAR(20) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        default_audiences TEXT[] NOT NULL DEFAULT '{}'::text[],
        overrideable BOOLEAN NOT NULL DEFAULT TRUE,
        sub_channel VARCHAR(64) NULL,
        rationale TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT audience_routing_category_check CHECK (event_category IN (
          'EncounterEvent','WorldEvent','NarrativeEvent','SocialEvent'
        )),
        CONSTRAINT audience_routing_unique UNIQUE (event_category, event_type)
      )
    `);

    // 3. campaign_audience_overrides — per-campaign overrides.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS campaign_audience_overrides (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        event_category VARCHAR(20) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        audiences TEXT[] NOT NULL DEFAULT '{}'::text[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT campaign_audience_overrides_category_check CHECK (event_category IN (
          'EncounterEvent','WorldEvent','NarrativeEvent','SocialEvent'
        )),
        CONSTRAINT campaign_audience_overrides_unique UNIQUE (campaign_id, event_category, event_type)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_audience_overrides_campaign
        ON campaign_audience_overrides(campaign_id)
    `);

    // 4. event_subscribers — registry pra subscribers dinâmicos (spec 022).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS event_subscribers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listener_name VARCHAR(120) NOT NULL UNIQUE,
        categories TEXT[] NOT NULL DEFAULT '{}'::text[],
        scope JSONB NOT NULL DEFAULT '{}'::jsonb,
        registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // 5. event_listener_processed — ADR-017 prática 4 (idempotência).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS event_listener_processed (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listener_name VARCHAR(120) NOT NULL,
        event_id UUID NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT event_listener_processed_unique UNIQUE (listener_name, event_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_event_listener_processed_event_id
        ON event_listener_processed(event_id)
    `);

    // 6. Seed audience_routing defaults a partir da matriz formal de
    //    contracts/audience-routing.json. Ordem importa: lista exatamente
    //    as 39 entries do contract spec 017. INSERT ... ON CONFLICT DO NOTHING
    //    permite re-run idempotente.
    await queryRunner.query(`
      INSERT INTO audience_routing (event_category, event_type, default_audiences, overrideable, sub_channel, rationale)
      VALUES
        ('EncounterEvent','damage_applied',ARRAY['CombatAgent','Narrator','HUD'],TRUE,'hp-bar','Combat L2 invalida threat map; Narrator anota pra prose; HUD atualiza HP bar.'),
        ('EncounterEvent','condition_added',ARRAY['CombatAgent','Narrator','HUD'],TRUE,'condition-badges',NULL),
        ('EncounterEvent','condition_removed',ARRAY['CombatAgent','Narrator','HUD'],TRUE,'condition-badges',NULL),
        ('EncounterEvent','participant_died',ARRAY['CombatAgent','Narrator','Director','HUD','CompanionAI'],FALSE,'toast','Closure mechanic + companion approval + Chekhov payoff — todos precisam saber.'),
        ('EncounterEvent','encounter_started_from_narrative',ARRAY['CombatAgent','HUD','Director','Narrator'],FALSE,'transition','Spec 020 trigger crítico — todos precisam, atomicidade obrigatória.'),
        ('EncounterEvent','encounter_ended',ARRAY['CombatAgent','Narrator','Director','HUD','CompanionAI'],FALSE,'transition',NULL),
        ('EncounterEvent','spell_cast',ARRAY['CombatAgent','Narrator','HUD'],TRUE,'combat-log',NULL),
        ('EncounterEvent','attack_resolved',ARRAY['CombatAgent','Narrator','HUD'],TRUE,'combat-log',NULL),
        ('EncounterEvent','concentration_broken',ARRAY['CombatAgent','Narrator','HUD'],TRUE,'concentration-badge',NULL),
        ('EncounterEvent','tile_effect_triggered',ARRAY['CombatAgent','Narrator','HUD'],TRUE,'battlemap',NULL),
        ('EncounterEvent','dying_state_changed',ARRAY['CombatAgent','Narrator','HUD','CompanionAI'],FALSE,'dying-overlay','Spec 020 — captured/dying/dead afeta turn order, narrativa e companion.'),
        ('WorldEvent','weather_changed',ARRAY['Narrator','CombatAgent','Director','HUD'],TRUE,'ambiance-pill','L2 perception cost re-calc; Narrator SPR rider; HUD pill update; Director ajusta pacing.'),
        ('WorldEvent','time_advanced',ARRAY['Narrator','Director','HUD'],TRUE,'ambiance-pill',NULL),
        ('WorldEvent','chaos_factor_changed',ARRAY['Narrator','Director','HUD'],TRUE,'ambiance-pill','Spec 019 — Director recalibra random event roll.'),
        ('WorldEvent','period_changed',ARRAY['Narrator','HUD','CompanionAI','Director'],TRUE,'ambiance-pill',NULL),
        ('WorldEvent','location_revealed',ARRAY['Narrator','Director','HUD'],TRUE,'minimap',NULL),
        ('WorldEvent','location_visited',ARRAY['Narrator','Director','HUD'],TRUE,'minimap',NULL),
        ('WorldEvent','lighting_changed',ARRAY['Narrator','CombatAgent','HUD'],TRUE,'battlemap',NULL),
        ('NarrativeEvent','dialog_chosen',ARRAY['Narrator','Director','CompanionAI'],TRUE,NULL,'Companion approval reage ao tag da choice; Director registra impacto.'),
        ('NarrativeEvent','lore_revealed',ARRAY['Narrator','Director','HUD'],TRUE,'lore-log',NULL),
        ('NarrativeEvent','persona_invoked',ARRAY['Narrator','Director','CompanionAI','HUD'],FALSE,'persona-flash','Spec 018 — bond/ideal/flaw deve chegar a todos. Não overrideable.'),
        ('NarrativeEvent','narrative_decision_made',ARRAY['Director','CompanionAI'],TRUE,NULL,'Director core consumer — approval engine reage.'),
        ('NarrativeEvent','voice_drift_detected',ARRAY['Director'],TRUE,NULL,'Spec 021 — Director apenas (admin alert futuro).'),
        ('NarrativeEvent','tool_intent_rejected',ARRAY['Director'],TRUE,NULL,'Spec 021 guardrail — Director audita.'),
        ('NarrativeEvent','npc_moved',ARRAY['Narrator','Director','HUD'],TRUE,'ambient',NULL),
        ('NarrativeEvent','npc_created',ARRAY['Narrator','Director','CompanionAI','HUD'],TRUE,'ambient',NULL),
        ('NarrativeEvent','revivify_eligibility_checked',ARRAY['Narrator','CompanionAI','Director'],TRUE,'spell-feedback',NULL),
        ('SocialEvent','companion_approval_changed',ARRAY['Narrator','Director','CompanionAI','HUD'],TRUE,'approval','Spec 022 — Narrator anota rider, Director ajusta pacing, CompanionAI re-rank, HUD anima bar.'),
        ('SocialEvent','companion_approval_threshold_crossed',ARRAY['Director','CompanionAI','Narrator','HUD'],FALSE,'approval','Spec 022 — milestone narrativo, Narrator deve mencionar próxima cena.'),
        ('SocialEvent','companion_recruited',ARRAY['Narrator','Director','CompanionAI','HUD'],FALSE,'toast','Spec 022 — entrada de companion na party é evento marco.'),
        ('SocialEvent','companion_dismissed',ARRAY['Narrator','Director','CompanionAI','HUD'],FALSE,'toast','Spec 022 — saída de companion altera party.'),
        ('SocialEvent','companion_spoke',ARRAY['Narrator','Director','CompanionAI','HUD'],TRUE,'dialogue','Spec 022 — fala companion entra no buffer SPR do Narrator.'),
        ('SocialEvent','companion_disagreement',ARRAY['Narrator','Director','CompanionAI','HUD'],FALSE,'toast','Spec 022 — recusa moral é fricção dramática.'),
        ('SocialEvent','companion_relationship_phase_changed',ARRAY['Narrator','Director','CompanionAI','HUD'],FALSE,'toast','Spec 022 — phase change é beat narrativo.'),
        ('SocialEvent','companion_romance_milestone',ARRAY['Director','CompanionAI','Narrator','HUD'],FALSE,'toast','Spec 022 — milestone irrenunciável.'),
        ('SocialEvent','disposition_changed',ARRAY['Narrator','Director','CompanionAI','HUD'],TRUE,'reputation',NULL),
        ('SocialEvent','reputation_shift',ARRAY['Narrator','Director','HUD'],TRUE,'reputation',NULL),
        ('SocialEvent','bond_formed',ARRAY['Narrator','Director','CompanionAI','HUD'],FALSE,'toast',NULL),
        ('SocialEvent','bond_broken',ARRAY['Narrator','Director','CompanionAI','HUD'],FALSE,'toast',NULL),
        ('SocialEvent','item_lost',ARRAY['Narrator','CompanionAI','HUD'],TRUE,'inventory','Spec 020 — item perdido aciona companion approval delta.'),
        ('SocialEvent','currency_changed',ARRAY['CompanionAI','HUD'],TRUE,'currency','Spec 020 — set_currency emite delta; HUD anima counter.'),
        ('SocialEvent','loot_rolled',ARRAY['Narrator','CompanionAI','HUD'],TRUE,'loot','Spec 020 — loot drawer aparece, Narrator pode descrever.')
      ON CONFLICT (event_category, event_type) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_event_listener_processed_event_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS event_listener_processed`);
    await queryRunner.query(`DROP TABLE IF EXISTS event_subscribers`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_campaign_audience_overrides_campaign`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS campaign_audience_overrides`);
    await queryRunner.query(`DROP TABLE IF EXISTS audience_routing`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_session_events_session_category_seq`,
    );
    await queryRunner.query(`
      ALTER TABLE session_events
        DROP CONSTRAINT IF EXISTS session_events_event_category_check
    `);
    await queryRunner.query(`
      ALTER TABLE session_events
        DROP COLUMN IF EXISTS aggregate_id,
        DROP COLUMN IF EXISTS version,
        DROP COLUMN IF EXISTS metadata,
        DROP COLUMN IF EXISTS narrative_descriptor,
        DROP COLUMN IF EXISTS span_id,
        DROP COLUMN IF EXISTS trace_id,
        DROP COLUMN IF EXISTS audiences,
        DROP COLUMN IF EXISTS event_payload,
        DROP COLUMN IF EXISTS event_category
    `);
  }
}
