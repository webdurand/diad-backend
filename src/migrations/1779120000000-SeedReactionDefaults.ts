import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 016 M5 — Seed defaults de reactions por classe (RAW 2024 + Solasta lesson).
 *
 * Defaults sensatos reduzem fadiga: Fighter OA always (passivo),
 * Shield/Counterspell ask (consomem slot), Sanctuary ask (custa slot 1),
 * Rogue Uncanny Dodge auto (sem custo de slot).
 *
 * Player override persiste em `character_state.reaction_prefs` jsonb.
 *
 * Ver `specs/016-play-shell-foundation/spec.md` §8.2.
 */

interface DefaultRow {
  classSlug: string;
  reactionName: string;
  defaultState: "auto" | "ask" | "off";
  consumesSpellSlot: boolean;
  description: string;
}

const DEFAULTS: DefaultRow[] = [
  // Fighter
  {
    classSlug: "fighter",
    reactionName: "opportunity-attack",
    defaultState: "auto",
    consumesSpellSlot: false,
    description: "OA passivo — dispara quando inimigo sai do alcance.",
  },
  {
    classSlug: "fighter",
    reactionName: "second-wind",
    defaultState: "auto",
    consumesSpellSlot: false,
    description: "Recupera HP quando você cai abaixo de 50%; bônus action.",
  },
  // Wizard
  {
    classSlug: "wizard",
    reactionName: "shield",
    defaultState: "ask",
    consumesSpellSlot: true,
    description: "+5 CA até início do próximo turno; consome slot 1.",
  },
  {
    classSlug: "wizard",
    reactionName: "counterspell",
    defaultState: "ask",
    consumesSpellSlot: true,
    description:
      "Cancela spell inimiga; consome slot 3+ (RAW 2024 ability check).",
  },
  // Cleric
  {
    classSlug: "cleric",
    reactionName: "sanctuary",
    defaultState: "ask",
    consumesSpellSlot: true,
    description: "Protege aliado de ataque; consome slot 1.",
  },
  // Sorcerer
  {
    classSlug: "sorcerer",
    reactionName: "counterspell",
    defaultState: "ask",
    consumesSpellSlot: true,
    description: "Cancela spell inimiga; consome slot 3+.",
  },
  {
    classSlug: "sorcerer",
    reactionName: "shield",
    defaultState: "ask",
    consumesSpellSlot: true,
    description: "+5 CA via subclass spell list; consome slot 1.",
  },
  // Bard
  {
    classSlug: "bard",
    reactionName: "cutting-words",
    defaultState: "ask",
    consumesSpellSlot: false,
    description: "Reduz attack/check inimigo (Lore L3); consome bardic die.",
  },
  // Paladin
  {
    classSlug: "paladin",
    reactionName: "rebuke-the-violent-2024",
    defaultState: "ask",
    consumesSpellSlot: true,
    description: "Oath of Vengeance L7 — força save quando aliado é atingido.",
  },
  // Rogue
  {
    classSlug: "rogue",
    reactionName: "uncanny-dodge",
    defaultState: "auto",
    consumesSpellSlot: false,
    description: "Reduz pela metade dano de ataque visível (L5+).",
  },
];

export class SeedReactionDefaults1779120000000 implements MigrationInterface {
  name = "SeedReactionDefaults1779120000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const d of DEFAULTS) {
      await queryRunner.query(
        `INSERT INTO reaction_defaults
           (class_slug, reaction_name, default_state, consumes_spell_slot, description)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (class_slug, reaction_name) DO UPDATE SET
           default_state = EXCLUDED.default_state,
           consumes_spell_slot = EXCLUDED.consumes_spell_slot,
           description = EXCLUDED.description`,
        [
          d.classSlug,
          d.reactionName,
          d.defaultState,
          d.consumesSpellSlot,
          d.description,
        ],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = DEFAULTS.map(
      (d) => `('${d.classSlug}','${d.reactionName}')`,
    ).join(",");
    await queryRunner.query(
      `DELETE FROM reaction_defaults
       WHERE (class_slug, reaction_name) IN (${rows})`,
    );
  }
}
