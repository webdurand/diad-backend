import { MigrationInterface, QueryRunner } from "typeorm";

interface SeedOpeningArchetype {
  key: string;
  displayName: string;
  promptShape: string;
  requiredSlots: string[];
  optionalSlots: string[];
  bannedPhrases: string[];
  requiredVoiceProfiles: string[];
  compatiblePcTags: string[];
  incompatiblePcTags: string[];
  emotionalArc: string;
  weightDefault: number;
  fewShotExample: string;
  isActive: boolean;
  since: string;
}

const OPENING_ARCHETYPE_SEEDS: SeedOpeningArchetype[] = [
  {
    key: "in_medias_res",
    displayName: "In Medias Res",
    promptShape:
      "{{pc.name}} sente {{sensory.anchor}} antes de qualquer pensamento. {{imminent_threat}} está a um passo. Não há tempo para escolher como respirar, só para agir.",
    requiredSlots: ["pc.name", "sensory.anchor", "imminent_threat"],
    optionalSlots: ["npc.bystander.name", "location.name"],
    bannedPhrases: ["era uma vez", "de repente", "fazia muito tempo"],
    requiredVoiceProfiles: [
      "heroic-high-fantasy",
      "grim-low-fantasy",
      "comico-pulp",
    ],
    compatiblePcTags: ["fighter", "barbarian", "rogue", "high-dex", "martial"],
    incompatiblePcTags: [],
    emotionalArc: "rise",
    weightDefault: 1.5,
    fewShotExample:
      "Goma sente o gosto metálico do sangue antes de ouvir o grito. Uma flecha treme na madeira ao lado do rosto. O arqueiro recarregou.",
    isActive: true,
    since: "037",
  },
  {
    key: "misterio_camara_vazia",
    displayName: "Mistério da Câmara Vazia",
    promptShape:
      "{{location.name}} deveria estar habitado. {{pc.name}} entra e encontra {{anomaly.detail}}. O silêncio aqui não é vazio; está esperando.",
    requiredSlots: ["pc.name", "anomaly.detail", "location.name"],
    optionalSlots: ["npc.witness.name", "missing_object"],
    bannedPhrases: ["misteriosamente", "estranhamente", "como num sonho"],
    requiredVoiceProfiles: ["investigativo-misterioso", "grim-low-fantasy"],
    compatiblePcTags: [
      "wizard",
      "cleric",
      "scholar",
      "perception-trained",
      "background:investigator",
      "caster",
    ],
    incompatiblePcTags: ["chaotic-stupid"],
    emotionalArc: "man-in-hole",
    weightDefault: 1,
    fewShotExample:
      "A Câmara de Projetos deveria fumar com vinte mãos no trabalho. Maguin entra: roldanas giram sozinhas, planos rasgados batem no chão. Uma cadeira ainda quente.",
    isActive: true,
    since: "037",
  },
  {
    key: "perda_irrecuperavel",
    displayName: "Perda Irrecuperável",
    promptShape:
      "{{pc.name}} percebe primeiro a ausência: {{missing_object}} não está onde deveria. {{sensory.anchor}} prende a garganta. Alguém levou mais do que um objeto.",
    requiredSlots: ["pc.name", "missing_object", "sensory.anchor"],
    optionalSlots: ["location.name", "npc.witness.name"],
    bannedPhrases: ["algo estava errado", "um vazio no peito"],
    requiredVoiceProfiles: [
      "heroic-high-fantasy",
      "grim-low-fantasy",
      "investigativo-misterioso",
    ],
    compatiblePcTags: [
      "bond:mentor",
      "bond:lost-love",
      "flaw:obsession",
      "ideal:redemption",
    ],
    incompatiblePcTags: [],
    emotionalArc: "fall",
    weightDefault: 1,
    fewShotExample:
      "O cofre ainda está fechado. A chave de cobre, não. No veludo, só a marca limpa onde ela repousou por anos.",
    isActive: true,
    since: "037",
  },
  {
    key: "encontro_fatidico",
    displayName: "Encontro Fatídico",
    promptShape:
      "{{pc.name}} cruza o olhar de {{npc.stranger.name}} antes de qualquer palavra. {{npc.stranger.first_glance}}. Entre vocês, {{stake_object}} — e a certeza incômoda de que ele veio por isso.",
    requiredSlots: [
      "pc.name",
      "npc.stranger.name",
      "npc.stranger.first_glance",
      "stake_object",
    ],
    optionalSlots: ["weather", "location.name"],
    bannedPhrases: ["o destino quis", "como por acaso", "na poeira do tempo"],
    requiredVoiceProfiles: ["heroic-high-fantasy", "investigativo-misterioso"],
    compatiblePcTags: [
      "bard",
      "warlock",
      "high-charisma",
      "bond:mentor",
      "ideal:redemption",
    ],
    incompatiblePcTags: [],
    emotionalArc: "cinderella",
    weightDefault: 1,
    fewShotExample:
      "Maguin cruza o olhar do velho antes de qualquer palavra. Óleo preto nas mãos, nenhum sorriso. Entre vocês, um plano rasgado pregado na parede.",
    isActive: true,
    since: "037",
  },
  {
    key: "retorno_inesperado",
    displayName: "Retorno Inesperado",
    promptShape:
      "{{location.name}} mudou desde a última lembrança de {{pc.name}}. {{sensory.anchor}} denuncia uma presença antiga. Algo que devia ficar enterrado aprendeu o caminho de volta.",
    requiredSlots: ["pc.name", "location.name", "sensory.anchor"],
    optionalSlots: ["npc.witness.name", "anomaly.detail"],
    bannedPhrases: ["muito tempo atrás", "memórias voltam"],
    requiredVoiceProfiles: [],
    compatiblePcTags: ["bond:mentor", "background:soldier", "ideal:redemption"],
    incompatiblePcTags: [],
    emotionalArc: "return",
    weightDefault: 0.9,
    fewShotExample:
      "A torre da infância não está em ruínas. Está acesa. E alguém lá dentro usa a mesma canção que seu mestre assobiava.",
    isActive: true,
    since: "037",
  },
  {
    key: "descoberta_proibida",
    displayName: "Descoberta Proibida",
    promptShape:
      "{{pc.name}} encontra {{anomaly.detail}} escondido sob {{stake_object}}. {{sensory.anchor}} atravessa o ar. O segredo não pede licença; pede preço.",
    requiredSlots: [
      "pc.name",
      "anomaly.detail",
      "stake_object",
      "sensory.anchor",
    ],
    optionalSlots: ["location.name"],
    bannedPhrases: ["segredo ancestral", "conhecimento proibido"],
    requiredVoiceProfiles: [
      "heroic-high-fantasy",
      "grim-low-fantasy",
      "investigativo-misterioso",
    ],
    compatiblePcTags: [
      "wizard",
      "warlock",
      "caster",
      "scholar",
      "flaw:obsession",
    ],
    incompatiblePcTags: [],
    emotionalArc: "icarus",
    weightDefault: 1,
    fewShotExample:
      "Sob a tampa do relicário há um mapa que se desenha sozinho. A tinta segue o pulso de Maguin.",
    isActive: true,
    since: "037",
  },
  {
    key: "divida_cobrada",
    displayName: "Dívida Cobrada",
    promptShape:
      "{{npc.stranger.name}} sabe o nome de {{pc.name}}. {{npc.stranger.first_glance}}. Sobre {{stake_object}}, a cobrança chega simples: pague agora ou escolha quem sangra depois.",
    requiredSlots: [
      "pc.name",
      "npc.stranger.name",
      "npc.stranger.first_glance",
      "stake_object",
    ],
    optionalSlots: ["location.name"],
    bannedPhrases: ["dívida antiga", "preço do passado"],
    requiredVoiceProfiles: ["grim-low-fantasy", "comico-pulp"],
    compatiblePcTags: [
      "rogue",
      "warlock",
      "background:criminal",
      "flaw:greed",
      "bond:mentor",
    ],
    incompatiblePcTags: [],
    emotionalArc: "man-in-hole",
    weightDefault: 0.95,
    fewShotExample:
      "A mulher conhece seu nome e o valor exato da sua bolsa. O contrato na mesa tem sua assinatura, mas você nunca o viu.",
    isActive: true,
    since: "037",
  },
  {
    key: "perseguicao_imediata",
    displayName: "Perseguição Imediata",
    promptShape:
      "{{pc.name}} ouve {{imminent_threat}} atrás de si. {{location.name}} vira corredor estreito, gente demais, saídas de menos. {{sensory.anchor}} marca cada segundo perdido.",
    requiredSlots: [
      "pc.name",
      "imminent_threat",
      "location.name",
      "sensory.anchor",
    ],
    optionalSlots: ["weather", "npc.stranger.name"],
    bannedPhrases: ["sem olhar para trás", "correndo contra o tempo"],
    requiredVoiceProfiles: [
      "heroic-high-fantasy",
      "grim-low-fantasy",
      "comico-pulp",
    ],
    compatiblePcTags: ["rogue", "monk", "ranger", "high-dex", "martial"],
    incompatiblePcTags: [],
    emotionalArc: "rise",
    weightDefault: 1.05,
    fewShotExample:
      "O apito corta a feira. Três botas pesadas viram a esquina. A viela à direita acabou de ser fechada por uma carroça.",
    isActive: true,
    since: "037",
  },
];

export class ColdOpenEngine1790600000000 implements MigrationInterface {
  name = "ColdOpenEngine1790600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "opening_archetypes" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "key" varchar(64) NOT NULL,
        "display_name" varchar(120) NOT NULL,
        "prompt_shape" text NOT NULL,
        "required_slots" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "optional_slots" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "banned_phrases" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "required_voice_profiles" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "compatible_pc_tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "incompatible_pc_tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "emotional_arc" varchar(32) NOT NULL,
        "weight_default" double precision NOT NULL DEFAULT 1,
        "few_shot_example" text NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "since" varchar(3) NOT NULL DEFAULT '037',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_opening_archetypes_key" UNIQUE ("key")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "scenes"
        ADD COLUMN IF NOT EXISTS "cold_open_hook" jsonb NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_scenes_cold_open_archetype"
        ON "scenes" ((cold_open_hook->>'archetypeKey'))
        WHERE cold_open_hook IS NOT NULL
    `);

    for (const archetype of OPENING_ARCHETYPE_SEEDS) {
      await queryRunner.query(
        `
          INSERT INTO "opening_archetypes" (
            "key",
            "display_name",
            "prompt_shape",
            "required_slots",
            "optional_slots",
            "banned_phrases",
            "required_voice_profiles",
            "compatible_pc_tags",
            "incompatible_pc_tags",
            "emotional_arc",
            "weight_default",
            "few_shot_example",
            "is_active",
            "since"
          )
          VALUES (
            $1,
            $2,
            $3,
            $4::jsonb,
            $5::jsonb,
            $6::jsonb,
            $7::jsonb,
            $8::jsonb,
            $9::jsonb,
            $10,
            $11,
            $12,
            $13,
            $14
          )
          ON CONFLICT ("key")
          DO UPDATE SET
            "display_name" = EXCLUDED."display_name",
            "prompt_shape" = EXCLUDED."prompt_shape",
            "required_slots" = EXCLUDED."required_slots",
            "optional_slots" = EXCLUDED."optional_slots",
            "banned_phrases" = EXCLUDED."banned_phrases",
            "required_voice_profiles" = EXCLUDED."required_voice_profiles",
            "compatible_pc_tags" = EXCLUDED."compatible_pc_tags",
            "incompatible_pc_tags" = EXCLUDED."incompatible_pc_tags",
            "emotional_arc" = EXCLUDED."emotional_arc",
            "weight_default" = EXCLUDED."weight_default",
            "few_shot_example" = EXCLUDED."few_shot_example",
            "is_active" = EXCLUDED."is_active",
            "since" = EXCLUDED."since",
            "updated_at" = now()
        `,
        [
          archetype.key,
          archetype.displayName,
          archetype.promptShape,
          JSON.stringify(archetype.requiredSlots),
          JSON.stringify(archetype.optionalSlots),
          JSON.stringify(archetype.bannedPhrases),
          JSON.stringify(archetype.requiredVoiceProfiles),
          JSON.stringify(archetype.compatiblePcTags),
          JSON.stringify(archetype.incompatiblePcTags),
          archetype.emotionalArc,
          archetype.weightDefault,
          archetype.fewShotExample,
          archetype.isActive,
          archetype.since,
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
      VALUES (
        'NarrativeEvent',
        'cold_open_generated',
        ARRAY['Narrator','Director','HUD','Archivist'],
        FALSE,
        'cold-open',
        'Cold open inicia a sessão solo: Narrator usa o hook, Director registra pacing, HUD anima abertura e Archivist guarda o fato.'
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
        AND event_type = 'cold_open_generated'
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_scenes_cold_open_archetype"`);
    await queryRunner.query(`
      ALTER TABLE "scenes"
        DROP COLUMN IF EXISTS "cold_open_hook"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "opening_archetypes"`);
  }
}
