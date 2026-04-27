import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Fix equipment_options dos backgrounds PHB 2014.
 *
 * A migration 1776700000000 gravou equipment_options como:
 *   { starting: ['crowbar', ...], gold: 15 }
 *
 * O frontend (StepBackground.tsx) espera:
 *   - key `_` = lista fixa sem escolha A/B
 *   - items como objetos `{ name, slug }` (string crua vira item.name undefined -> fallback "Item")
 *
 * Esta migration normaliza os 9 backgrounds -phb para o formato correto:
 *   { _: [{ name: 'Crowbar', slug: 'crowbar' }, ...], gold: 15 }
 */
export class FixPhb2014BackgroundEquipment1776800000000 implements MigrationInterface {
  name = "FixPhb2014BackgroundEquipment1776800000000";

  private readonly equipmentBySlug: Record<
    string,
    { items: string[]; gold: number }
  > = {
    "acolyte-phb": {
      items: [
        "holy-symbol",
        "prayer-book",
        "stick-of-incense",
        "vestments",
        "common-clothes",
      ],
      gold: 15,
    },
    "charlatan-phb": {
      items: ["fine-clothes", "disguise-kit", "tools-of-the-con"],
      gold: 15,
    },
    "criminal-phb": {
      items: ["crowbar", "dark-common-clothes", "pouch"],
      gold: 15,
    },
    "entertainer-phb": {
      items: ["musical-instrument", "costume", "pouch"],
      gold: 15,
    },
    "hermit-phb": {
      items: [
        "scroll-case",
        "winter-blanket",
        "herbalism-kit",
        "common-clothes",
      ],
      gold: 5,
    },
    "noble-phb": {
      items: ["fine-clothes", "signet-ring", "scroll-of-pedigree"],
      gold: 25,
    },
    "sage-phb": {
      items: [
        "ink",
        "quill",
        "small-knife",
        "letter-from-dead-colleague",
        "common-clothes",
      ],
      gold: 10,
    },
    "sailor-phb": {
      items: ["belaying-pin", "silk-rope", "lucky-charm", "common-clothes"],
      gold: 10,
    },
    "soldier-phb": {
      items: [
        "insignia-of-rank",
        "trophy-from-fallen-enemy",
        "dice-set",
        "common-clothes",
      ],
      gold: 10,
    },
  };

  private humanize(slug: string): string {
    return slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [slug, { items, gold }] of Object.entries(
      this.equipmentBySlug,
    )) {
      const equipmentOptions = {
        _: items.map((itemSlug) => ({
          name: this.humanize(itemSlug),
          slug: itemSlug,
        })),
        gold,
      };

      await queryRunner.query(
        `UPDATE backgrounds SET equipment_options = $1, updated_at = now() WHERE slug = $2`,
        [JSON.stringify(equipmentOptions), slug],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [slug, { items, gold }] of Object.entries(
      this.equipmentBySlug,
    )) {
      const equipmentOptions = { starting: items, gold };

      await queryRunner.query(
        `UPDATE backgrounds SET equipment_options = $1, updated_at = now() WHERE slug = $2`,
        [JSON.stringify(equipmentOptions), slug],
      );
    }
  }
}
