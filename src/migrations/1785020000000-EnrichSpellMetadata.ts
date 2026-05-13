import { MigrationInterface, QueryRunner } from "typeorm";


export class EnrichSpellMetadata1785020000000 implements MigrationInterface {
  name = "EnrichSpellMetadata1785020000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "spells"
      ADD COLUMN IF NOT EXISTS "arbiter_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);



    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_spells_arbiter_metadata"
        ON "spells" USING gin ("arbiter_metadata" jsonb_path_ops)
    `);









    type Meta = {
      name: string;
      is_harmful: boolean;
      damaging?: boolean;
      forces_save?: boolean;
      save_ability?: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
      imposes_disadvantage?: boolean;
      target_type:
        | "self"
        | "willing_creature"
        | "ally"
        | "enemy"
        | "creature"
        | "creature_or_object"
        | "object"
        | "space";
      target_perception_mode?: "obvious" | "subtle" | "hidden";
      target_aware_post_effect?: boolean;
      breaks_protection?: boolean;
      on_expire_hook?: { action: string; context?: Record<string, unknown> };
      hostile_intent_default: "always" | "conditional" | "never";
      is_aoe?: boolean;
    };

    const damaging = (
      name: string,
      target_type: Meta["target_type"],
      save?: Meta["save_ability"],
      is_aoe = false,
    ): Meta => ({
      name,
      is_harmful: true,
      damaging: true,
      forces_save: save !== undefined,
      ...(save ? { save_ability: save } : {}),
      target_type,
      target_perception_mode: "obvious",
      hostile_intent_default: "always",
      ...(is_aoe ? { is_aoe: true } : {}),
    });

    const heal = (name: string): Meta => ({
      name,
      is_harmful: false,
      damaging: false,
      target_type: "willing_creature",
      target_perception_mode: "obvious",
      hostile_intent_default: "never",
    });

    const buff = (
      name: string,
      target_type: Meta["target_type"] = "willing_creature",
    ): Meta => ({
      name,
      is_harmful: false,
      damaging: false,
      target_type,
      target_perception_mode: "obvious",
      hostile_intent_default: "never",
    });

    const debuff = (
      name: string,
      save: Meta["save_ability"],
      target_type: Meta["target_type"] = "creature",
    ): Meta => ({
      name,
      is_harmful: true,
      damaging: false,
      forces_save: true,
      save_ability: save,
      target_type,
      target_perception_mode: "obvious",
      hostile_intent_default: "always",
    });

    const seed: Array<{ slug: string; metadata: Meta }> = [

      { slug: "fire-bolt", metadata: damaging("Fire Bolt", "creature") },
      {
        slug: "eldritch-blast",
        metadata: damaging("Eldritch Blast", "creature"),
      },
      { slug: "ray-of-frost", metadata: damaging("Ray of Frost", "creature") },
      {
        slug: "sacred-flame",
        metadata: damaging("Sacred Flame", "creature", "DEX"),
      },
      {
        slug: "vicious-mockery",
        metadata: damaging("Vicious Mockery", "creature", "WIS"),
      },
      {
        slug: "poison-spray",
        metadata: damaging("Poison Spray", "creature", "CON"),
      },
      {
        slug: "shocking-grasp",
        metadata: damaging("Shocking Grasp", "creature"),
      },
      {
        slug: "produce-flame",
        metadata: damaging("Produce Flame", "creature"),
      },
      { slug: "guidance", metadata: buff("Guidance") },
      { slug: "light", metadata: buff("Light", "object") },
      { slug: "mage-hand", metadata: buff("Mage Hand", "space") },
      { slug: "spare-the-dying", metadata: heal("Spare the Dying") },
      { slug: "resistance", metadata: buff("Resistance") },
      { slug: "true-strike", metadata: buff("True Strike", "self") },
      {
        slug: "friends",
        metadata: {
          name: "Friends",
          is_harmful: false,
          damaging: false,
          target_type: "creature",
          target_perception_mode: "subtle",
          target_aware_post_effect: true,
          hostile_intent_default: "conditional",
          on_expire_hook: {
            action: "rearbitrate_hostility",
            context: { reason: "target_realizes_manipulation_post_effect" },
          },
        },
      },
      { slug: "minor-illusion", metadata: buff("Minor Illusion", "space") },


      {
        slug: "magic-missile",
        metadata: damaging("Magic Missile", "creature"),
      },
      {
        slug: "burning-hands",
        metadata: damaging("Burning Hands", "space", "DEX", true),
      },
      {
        slug: "chromatic-orb",
        metadata: damaging("Chromatic Orb", "creature"),
      },
      {
        slug: "thunderwave",
        metadata: damaging("Thunderwave", "space", "CON", true),
      },
      {
        slug: "inflict-wounds",
        metadata: damaging("Inflict Wounds", "creature"),
      },
      { slug: "cure-wounds", metadata: heal("Cure Wounds") },
      { slug: "healing-word", metadata: heal("Healing Word") },
      { slug: "bless", metadata: buff("Bless") },
      { slug: "shield-of-faith", metadata: buff("Shield of Faith") },
      { slug: "shield", metadata: buff("Shield", "self") },
      { slug: "mage-armor", metadata: buff("Mage Armor") },
      { slug: "sanctuary", metadata: buff("Sanctuary") },
      {
        slug: "protection-from-evil-and-good",
        metadata: buff("Protection from Evil and Good"),
      },
      {
        slug: "charm-person",
        metadata: {
          name: "Charm Person",
          is_harmful: true,
          damaging: false,
          forces_save: true,
          save_ability: "WIS",
          target_type: "creature",
          target_perception_mode: "obvious",
          target_aware_post_effect: true,
          hostile_intent_default: "conditional",
          on_expire_hook: {
            action: "rearbitrate_hostility",
            context: { reason: "target_realizes_manipulation" },
          },
        },
      },
      { slug: "command", metadata: debuff("Command", "WIS") },
      { slug: "sleep", metadata: debuff("Sleep", "WIS", "space") },
      { slug: "bane", metadata: debuff("Bane", "CHA", "space") },
      {
        slug: "dissonant-whispers",
        metadata: damaging("Dissonant Whispers", "creature", "WIS"),
      },
      {
        slug: "hex",
        metadata: {
          name: "Hex",
          is_harmful: true,
          damaging: false,
          imposes_disadvantage: true,
          target_type: "creature",
          target_perception_mode: "obvious",
          hostile_intent_default: "always",
        },
      },
      {
        slug: "hunters-mark",
        metadata: {
          name: "Hunter's Mark",
          is_harmful: true,
          damaging: false,
          imposes_disadvantage: true,
          target_type: "creature",
          target_perception_mode: "obvious",
          hostile_intent_default: "always",
        },
      },
      {
        slug: "faerie-fire",
        metadata: {
          name: "Faerie Fire",
          is_harmful: true,
          damaging: false,
          forces_save: true,
          save_ability: "DEX",
          imposes_disadvantage: true,
          target_type: "space",
          target_perception_mode: "obvious",
          is_aoe: true,
          hostile_intent_default: "always",
        },
      },


      {
        slug: "scorching-ray",
        metadata: damaging("Scorching Ray", "creature"),
      },
      { slug: "shatter", metadata: damaging("Shatter", "space", "CON", true) },
      { slug: "hold-person", metadata: debuff("Hold Person", "WIS") },
      { slug: "suggestion", metadata: debuff("Suggestion", "WIS") },
      {
        slug: "blindness-deafness",
        metadata: debuff("Blindness/Deafness", "CON"),
      },
      { slug: "aid", metadata: heal("Aid") },
      { slug: "lesser-restoration", metadata: heal("Lesser Restoration") },
      { slug: "invisibility", metadata: buff("Invisibility") },
      { slug: "mirror-image", metadata: buff("Mirror Image", "self") },
      { slug: "misty-step", metadata: buff("Misty Step", "self") },
      { slug: "blur", metadata: buff("Blur", "self") },
      { slug: "spike-growth", metadata: damaging("Spike Growth", "space") },
      { slug: "web", metadata: debuff("Web", "DEX", "space") },


      {
        slug: "fireball",
        metadata: {
          name: "Fireball",
          is_harmful: true,
          damaging: true,
          forces_save: true,
          save_ability: "DEX",
          target_type: "space",
          target_perception_mode: "obvious",
          is_aoe: true,
          hostile_intent_default: "always",
        },
      },
      {
        slug: "lightning-bolt",
        metadata: damaging("Lightning Bolt", "space", "DEX", true),
      },
      { slug: "fear", metadata: debuff("Fear", "WIS", "space") },
      {
        slug: "hypnotic-pattern",
        metadata: debuff("Hypnotic Pattern", "WIS", "space"),
      },
      { slug: "haste", metadata: buff("Haste") },
      { slug: "slow", metadata: debuff("Slow", "WIS", "space") },
      {
        slug: "counterspell",
        metadata: {
          name: "Counterspell",
          is_harmful: true,
          target_type: "creature",
          target_perception_mode: "obvious",
          hostile_intent_default: "conditional",
        },
      },
      {
        slug: "dispel-magic",
        metadata: {
          name: "Dispel Magic",
          is_harmful: false,
          target_type: "creature_or_object",
          target_perception_mode: "obvious",
          hostile_intent_default: "conditional",
        },
      },
      { slug: "mass-healing-word", metadata: heal("Mass Healing Word") },
      { slug: "fly", metadata: buff("Fly") },
      { slug: "revivify", metadata: heal("Revivify") },


      { slug: "polymorph", metadata: debuff("Polymorph", "WIS") },
      {
        slug: "wall-of-fire",
        metadata: damaging("Wall of Fire", "space", "DEX", true),
      },
      { slug: "dimension-door", metadata: buff("Dimension Door", "self") },
      { slug: "stoneskin", metadata: buff("Stoneskin") },
      {
        slug: "cone-of-cold",
        metadata: damaging("Cone of Cold", "space", "CON", true),
      },
      { slug: "hold-monster", metadata: debuff("Hold Monster", "WIS") },
      { slug: "mass-cure-wounds", metadata: heal("Mass Cure Wounds") },
      { slug: "raise-dead", metadata: heal("Raise Dead") },


      {
        slug: "knock",
        metadata: {
          name: "Knock",
          is_harmful: false,
          target_type: "object",
          target_perception_mode: "obvious",
          hostile_intent_default: "never",
        },
      },
      {
        slug: "fog-cloud",
        metadata: {
          name: "Fog Cloud",
          is_harmful: false,
          target_type: "space",
          target_perception_mode: "obvious",
          hostile_intent_default: "never",
        },
      },
      {
        slug: "darkness",
        metadata: {
          name: "Darkness",
          is_harmful: false,
          target_type: "space",
          target_perception_mode: "obvious",
          hostile_intent_default: "never",
        },
      },
      {
        slug: "silence",
        metadata: {
          name: "Silence",
          is_harmful: false,
          target_type: "space",
          target_perception_mode: "obvious",
          hostile_intent_default: "never",
        },
      },
      { slug: "detect-magic", metadata: buff("Detect Magic", "self") },
    ];

    let updated = 0;
    for (const row of seed) {
      const result = await queryRunner.query(
        `UPDATE "spells"
           SET "arbiter_metadata" = $2::jsonb,
               "updated_at" = now()
           WHERE "slug" = $1
           RETURNING "id"`,
        [row.slug, JSON.stringify(row.metadata)],
      );
      if (Array.isArray(result?.[0]) && result[0].length > 0) {
        updated += result[0].length;
      } else if (Array.isArray(result) && result.length > 0) {


        updated += result.filter(
          (r: unknown) => r && typeof r === "object" && "id" in r,
        ).length;
      }
    }




    const total = await queryRunner.query(
      `SELECT COUNT(*)::int AS n FROM "spells" WHERE "arbiter_metadata" <> '{}'::jsonb`,
    );
    const enriched = total?.[0]?.n ?? 0;
    if (enriched === 0 && updated === 0) {
      console.warn(
        `[EnrichSpellMetadata] Backfill rodou mas 0 spells matched (DB sem seed?). ` +
          `Coluna criada — agents vai usar registry stub como fallback.`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_spells_arbiter_metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "spells" DROP COLUMN IF EXISTS "arbiter_metadata"`,
    );
  }
}
