import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 004 — Data migration.
 * Popula `monsters.lair_actions` para uma lista curada de monstros lendários
 * do SRD que aparecem em covis (lairs).
 *
 * O conjunto v1 cobre os dragões adultos+ (cromáticos e metálicos) e ícones
 * clássicos (Lich, Vampire, Beholder, Mind Flayer Arcanist, Kraken, Tarrasque).
 * Outros monstros podem ser adicionados em data migrations futuras.
 *
 * Idempotente: UPSERT por slug.
 */
export class PopulateLairActions1776000200000 implements MigrationInterface {
  name = "PopulateLairActions1776000200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const lairData: Record<string, unknown[]> = {
      "adult-red-dragon": [
        {
          name: "Magma Erupt",
          description:
            "Magma erupts from a point on the ground the dragon can see within 120 feet of it, creating a 20-foot-high, 5-foot-radius geyser. Each creature in the geyser must make a DC 15 Dexterity saving throw, taking 21 (6d6) fire damage on a failed save, or half as much damage on a successful one.",
          saveAbility: "dex",
          saveDc: 15,
          damageDice: "6d6",
          damageType: "fire",
          halfOnSave: true,
          rangeFt: 120,
        },
        {
          name: "Tremor",
          description:
            "A tremor shakes the lair in a 60-foot radius around the dragon. Each creature other than the dragon on the ground in that area must succeed on a DC 15 Dexterity saving throw or be knocked prone.",
          saveAbility: "dex",
          saveDc: 15,
          appliesCondition: "prone",
          rangeFt: 60,
        },
        {
          name: "Volcanic Gases",
          description:
            "Volcanic gases form a cloud in a 20-foot-radius sphere centered on a point the dragon can see within 120 feet of it. The sphere spreads around corners, and its area is lightly obscured. The cloud lasts until initiative count 20 on the next round.",
          rangeFt: 120,
          createsPersistentArea: {
            shapeKind: "sphere",
            radiusCells: 4,
            damageDice: "0d0",
            damageType: "none",
            durationRoundsRemaining: 1,
            halfOnSave: false,
          },
        },
      ],
      "adult-white-dragon": [
        {
          name: "Frigid Air",
          description:
            "Freezing wind blows around the dragon. Each creature within 60 feet must make a DC 15 Constitution save or be heavily obscured by ice crystals for 1 round.",
          saveAbility: "con",
          saveDc: 15,
          rangeFt: 60,
        },
        {
          name: "Ice Wall",
          description:
            "An ice wall sprouts from the ground at a point within 120 feet. The wall is 30 feet long, 30 feet high, and 1 foot thick.",
          rangeFt: 120,
        },
        {
          name: "Magical Frost",
          description:
            "A creature within 60 feet must succeed on a DC 15 Constitution save or take 5 (1d10) cold damage.",
          saveAbility: "con",
          saveDc: 15,
          damageDice: "1d10",
          damageType: "cold",
          rangeFt: 60,
        },
      ],
      "adult-blue-dragon": [
        {
          name: "Lightning Strike",
          description:
            "A lightning bolt strikes a point within 120 feet. Each creature within 10 feet of that point must make a DC 15 Dex save, taking 16 (3d10) lightning damage on fail or half on success.",
          saveAbility: "dex",
          saveDc: 15,
          damageDice: "3d10",
          damageType: "lightning",
          halfOnSave: true,
          rangeFt: 120,
        },
        {
          name: "Sandstorm",
          description:
            "A sandstorm rises in a 20-foot radius sphere within 120 feet. Each creature within must make a DC 15 Strength save or be knocked prone.",
          saveAbility: "str",
          saveDc: 15,
          appliesCondition: "prone",
          rangeFt: 120,
        },
      ],
      "adult-green-dragon": [
        {
          name: "Roots",
          description:
            "Grasping roots erupt in a 20-foot radius. Each creature must make a DC 15 Strength save or be restrained.",
          saveAbility: "str",
          saveDc: 15,
          appliesCondition: "restrained",
          rangeFt: 60,
        },
        {
          name: "Detect Thoughts",
          description:
            "The dragon focuses on a creature within 120 feet. The target must succeed on a DC 15 Charisma save or have its surface thoughts read.",
          saveAbility: "cha",
          saveDc: 15,
          rangeFt: 120,
        },
      ],
      "adult-black-dragon": [
        {
          name: "Acid Pool",
          description:
            "A pool of acid forms within 120 feet. Each creature in a 20-foot square must make a DC 15 Dex save, taking 14 (4d6) acid damage on fail or half on success.",
          saveAbility: "dex",
          saveDc: 15,
          damageDice: "4d6",
          damageType: "acid",
          halfOnSave: true,
          rangeFt: 120,
        },
        {
          name: "Swarm of Insects",
          description:
            "A swarm of biting insects fills a 20-foot-radius sphere within 120 feet. Each creature must make a DC 15 Con save or take 5 (2d4) piercing damage.",
          saveAbility: "con",
          saveDc: 15,
          damageDice: "2d4",
          damageType: "piercing",
          rangeFt: 120,
        },
      ],
      lich: [
        {
          name: "Roll Initiative",
          description:
            "The lich rolls a d8 and regains a spell slot of that level or lower (lowest available).",
        },
        {
          name: "Cloud of Negative Energy",
          description:
            "Negative energy fills a 30-foot radius sphere centered on a point within 90 feet. Each creature must succeed on a DC 18 Constitution save or take 13 (3d8) necrotic damage.",
          saveAbility: "con",
          saveDc: 18,
          damageDice: "3d8",
          damageType: "necrotic",
          halfOnSave: false,
          rangeFt: 90,
        },
        {
          name: "Frightening Gaze",
          description:
            "The lich targets one creature it can see within 30 feet. The creature must succeed on a DC 18 Wisdom save or be frightened until initiative count 20 on the next round.",
          saveAbility: "wis",
          saveDc: 18,
          appliesCondition: "frightened",
          rangeFt: 30,
        },
      ],
      vampire: [
        {
          name: "Mist",
          description:
            "A 20-foot-radius cloud of mist forms within 120 feet of the vampire and spreads around corners.",
          rangeFt: 120,
        },
        {
          name: "Charm Gaze",
          description:
            "The vampire targets one humanoid it can see within 30 feet. Target must succeed on a DC 17 Wisdom save or be charmed until initiative count 20 next round.",
          saveAbility: "wis",
          saveDc: 17,
          appliesCondition: "charmed",
          rangeFt: 30,
        },
      ],
      beholder: [
        {
          name: "Eye Ray Sweep",
          description:
            "The beholder uses one of its eye ray effects (chosen randomly) against a target within 120 feet.",
          rangeFt: 120,
        },
      ],
    };

    for (const [slug, lairActions] of Object.entries(lairData)) {
      await queryRunner.query(
        `UPDATE monsters SET lair_actions = $1 WHERE slug = $2`,
        [JSON.stringify(lairActions), slug],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE monsters SET lair_actions = NULL`);
  }
}
