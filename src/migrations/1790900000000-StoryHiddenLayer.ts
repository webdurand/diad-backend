import { MigrationInterface, QueryRunner } from "typeorm";

const XP_TRIGGER_STATE_DEFAULT =
  `'{ "objective_met": false, "belief_expressed": false, "flaw_struggled": false, "bond_progressed": false, "secret_revealed": false }'::jsonb`;

const RITUALS = [
  {
    key: "festival",
    displayName: "Festival",
    defaultTone: "jubilant",
    arcs: ["rise", "cinderella", "return"],
    tiers: ["TRIUMPH", "BITTERSWEET"],
    template:
      "A praça de {{location.name}} se enche de luzes e tambores para o festival. {{pc.name}} caminha entre os celebrantes, ainda sentindo o peso da fase que se encerrou.",
    banned: [],
  },
  {
    key: "funeral",
    displayName: "Funeral",
    defaultTone: "solemn",
    arcs: ["fall", "man-in-hole", "icarus", "oedipus"],
    tiers: ["COSTLY", "FAILURE", "BITTERSWEET"],
    template:
      "A pira de {{npc.fallen.name}} arde lentamente sob o céu de {{location.name}}. {{pc.name}} fica em silêncio, sem se mover, enquanto a fumaça sobe.",
    banned: [
      "descansem em paz",
      "até nos encontrarmos no além",
      "que sua alma encontre paz",
    ],
  },
  {
    key: "oath",
    displayName: "Juramento",
    defaultTone: "binding",
    arcs: ["rise", "oedipus", "return"],
    tiers: ["TRIUMPH", "BITTERSWEET", "COSTLY"],
    template:
      "{{pc.name}} fica de pé diante de {{npc.witness.name}}. As palavras do juramento saem antes do pensamento, e algo na sala muda quando elas pousam.",
    banned: ["pelos deuses", "que assim seja", "selado em sangue"],
  },
  {
    key: "return",
    displayName: "Retorno",
    defaultTone: "homecoming",
    arcs: ["return", "cinderella", "rise"],
    tiers: ["TRIUMPH", "BITTERSWEET"],
    template:
      "O portão de {{location.name}} se abre devagar. {{pc.name}} hesita antes de entrar: a cidade não é mais a mesma, e nem ele.",
    banned: ["lar doce lar", "como antigamente", "nada mudou"],
  },
  {
    key: "departure",
    displayName: "Partida",
    defaultTone: "departure",
    arcs: ["fall", "icarus", "rise"],
    tiers: ["BITTERSWEET", "COSTLY", "TRIUMPH"],
    template:
      "Os portões de {{location.name}} ficam para trás. {{pc.name}} olha o caminho à frente: não há retorno fácil de onde se vai.",
    banned: ["até logo", "novos horizontes", "uma nova jornada começa"],
  },
  {
    key: "toast",
    displayName: "Brinde",
    defaultTone: "celebratory",
    arcs: ["rise", "cinderella"],
    tiers: ["TRIUMPH", "BITTERSWEET"],
    template:
      "{{pc.name}} ergue o copo. À mesa, {{npcsAliveAtEnd}} fazem o mesmo. Por um instante, o vinho parece ter peso.",
    banned: ["à nossa", "salve", "que venham os bons tempos"],
  },
  {
    key: "vigil",
    displayName: "Vigília",
    defaultTone: "contemplative",
    arcs: ["man-in-hole", "fall", "oedipus", "return"],
    tiers: ["COSTLY", "BITTERSWEET", "FAILURE"],
    template:
      "A vela queima até quase o fim. {{pc.name}} fica sentado, olhando o ponto onde {{narrative.beat}} aconteceu. Os pássaros começam a cantar antes do amanhecer.",
    banned: [
      "a noite mais longa",
      "guardião da memória",
      "o silêncio dos justos",
    ],
  },
] as const;

export class StoryHiddenLayer1790900000000 implements MigrationInterface {
  name = "StoryHiddenLayer1790900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "phases"
        ADD COLUMN IF NOT EXISTS "closing_seed" jsonb NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "session_story_arc_state"
        ADD COLUMN IF NOT EXISTS "xp_trigger_state" jsonb NOT NULL DEFAULT ${XP_TRIGGER_STATE_DEFAULT}
    `);

    await queryRunner.query(`
      ALTER TABLE "phase_transitions"
        ADD COLUMN IF NOT EXISTS "outcome_tier" varchar(24) NULL,
        ADD COLUMN IF NOT EXISTS "xp_trigger_state" jsonb NULL,
        ADD COLUMN IF NOT EXISTS "diegetic_ritual_resolved" varchar(32) NULL,
        ADD COLUMN IF NOT EXISTS "two_beat" jsonb NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "diegetic_rituals" (
        "key" varchar(32) PRIMARY KEY,
        "display_name" varchar(60) NOT NULL,
        "default_tone" varchar(32) NOT NULL,
        "compatible_emotional_arcs" jsonb NOT NULL,
        "compatible_outcome_tiers" jsonb NOT NULL,
        "narrative_seed_template" text NOT NULL,
        "banned_phrases_contextual" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "since" varchar(3) NOT NULL DEFAULT '039'
      )
    `);

    for (const ritual of RITUALS) {
      await queryRunner.query(
        `
          INSERT INTO "diegetic_rituals" (
            "key",
            "display_name",
            "default_tone",
            "compatible_emotional_arcs",
            "compatible_outcome_tiers",
            "narrative_seed_template",
            "banned_phrases_contextual",
            "is_active",
            "since"
          )
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::jsonb, true, '039')
          ON CONFLICT ("key")
          DO UPDATE SET
            "display_name" = EXCLUDED."display_name",
            "default_tone" = EXCLUDED."default_tone",
            "compatible_emotional_arcs" = EXCLUDED."compatible_emotional_arcs",
            "compatible_outcome_tiers" = EXCLUDED."compatible_outcome_tiers",
            "narrative_seed_template" = EXCLUDED."narrative_seed_template",
            "banned_phrases_contextual" = EXCLUDED."banned_phrases_contextual",
            "is_active" = true,
            "since" = '039'
        `,
        [
          ritual.key,
          ritual.displayName,
          ritual.defaultTone,
          JSON.stringify(ritual.arcs),
          JSON.stringify(ritual.tiers),
          ritual.template,
          JSON.stringify(ritual.banned),
        ],
      );
    }

    await queryRunner.query(`
      INSERT INTO audience_routing (
        event_category,
        event_type,
        default_audiences,
        overrideable,
        sub_channel,
        rationale
      )
      VALUES
        (
          'NarrativeEvent',
          'phase_opened',
          ARRAY['Director','Narrator','Archivist'],
          FALSE,
          'story_hidden_layer',
          'Fase abriu com closing seed comprometido; consumidores internos leem SceneContext, payload público não carrega seed.'
        ),
        (
          'NarrativeEvent',
          'xp_trigger_marked',
          ARRAY['Director','Archivist'],
          FALSE,
          'story_hidden_layer',
          'Audit de trigger narrativo marcado naturalmente pelo Director.'
        ),
        (
          'NarrativeEvent',
          'phase_outcome_derived',
          ARRAY['Director','Narrator','Archivist'],
          FALSE,
          'story_hidden_layer',
          'Outcome categórico da fase derivado de checklist antes do bookend.'
        )
      ON CONFLICT (event_category, event_type)
      DO UPDATE SET
        default_audiences = EXCLUDED.default_audiences,
        overrideable = EXCLUDED.overrideable,
        sub_channel = EXCLUDED.sub_channel,
        rationale = EXCLUDED.rationale
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM audience_routing
      WHERE event_category = 'NarrativeEvent'
        AND event_type IN (
          'phase_opened',
          'xp_trigger_marked',
          'phase_outcome_derived'
        )
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "diegetic_rituals"`);
    await queryRunner.query(`
      ALTER TABLE "phase_transitions"
        DROP COLUMN IF EXISTS "two_beat",
        DROP COLUMN IF EXISTS "diegetic_ritual_resolved",
        DROP COLUMN IF EXISTS "xp_trigger_state",
        DROP COLUMN IF EXISTS "outcome_tier"
    `);
    await queryRunner.query(`
      ALTER TABLE "session_story_arc_state"
        DROP COLUMN IF EXISTS "xp_trigger_state"
    `);
    await queryRunner.query(`
      ALTER TABLE "phases"
        DROP COLUMN IF EXISTS "closing_seed"
    `);
  }
}
