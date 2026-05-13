import { MigrationInterface, QueryRunner } from "typeorm";


export class SeedPhb2014Backgrounds1776700000000 implements MigrationInterface {
  name = "SeedPhb2014Backgrounds1776700000000";

  private readonly backgrounds = [
    {
      slug: "acolyte-phb",
      name: "Acolyte",
      skills: ["skill-insight", "skill-religion"],
      feature: {
        name: "Shelter of the Faithful",
        description:
          "As an acolyte, you command the respect of those who share your faith, and you can perform the religious ceremonies of your deity. You and your adventuring companions can expect to receive free healing and care at a temple, shrine, or other established presence of your faith, though you must provide any material components needed for spells. Those who share your religion will support you (but only you) at a modest lifestyle.",
      },
      languageChoices: { choose: 2, type: "standard" },
      equipmentOptions: {
        starting: [
          "holy-symbol",
          "prayer-book",
          "stick-of-incense",
          "vestments",
          "common-clothes",
        ],
        gold: 15,
      },
    },
    {
      slug: "charlatan-phb",
      name: "Charlatan",
      skills: ["skill-deception", "skill-sleight-of-hand"],
      feature: {
        name: "False Identity",
        description:
          "You have created a second identity that includes documentation, established acquaintances, and disguises that allow you to assume that persona. Additionally, you can forge documents including official papers and personal letters, as long as you have seen an example of the kind of document or the handwriting you are trying to copy.",
      },
      toolProficiencies: ["disguise-kit", "forgery-kit"],
      equipmentOptions: {
        starting: ["fine-clothes", "disguise-kit", "tools-of-the-con"],
        gold: 15,
      },
    },
    {
      slug: "criminal-phb",
      name: "Criminal",
      skills: ["skill-deception", "skill-stealth"],
      feature: {
        name: "Criminal Contact",
        description:
          "You have a reliable and trustworthy contact who acts as your liaison to a network of other criminals. You know how to get messages to and from your contact, even over great distances; specifically, you know the local messengers, corrupt caravan masters, and seedy sailors who can deliver messages for you.",
      },
      toolProficiencies: ["thieves-tools"],
      equipmentOptions: {
        starting: ["crowbar", "dark-common-clothes", "pouch"],
        gold: 15,
      },
    },
    {
      slug: "entertainer-phb",
      name: "Entertainer",
      skills: ["skill-acrobatics", "skill-performance"],
      feature: {
        name: "By Popular Demand",
        description:
          "You can always find a place to perform, usually in an inn or tavern but possibly with a circus, at a theater, or even in a noble's court. At such a place, you receive free lodging and food of a modest or comfortable standard (depending on the quality of the establishment), as long as you perform each night. In addition, your performance makes you something of a local figure. When strangers recognize you in a town where you have performed, they typically take a liking to you.",
      },
      toolProficiencies: ["disguise-kit"],
      equipmentOptions: {
        starting: ["musical-instrument", "costume", "pouch"],
        gold: 15,
      },
    },
    {
      slug: "hermit-phb",
      name: "Hermit",
      skills: ["skill-medicine", "skill-religion"],
      feature: {
        name: "Discovery",
        description:
          "The quiet seclusion of your extended hermitage gave you access to a unique and powerful discovery. The exact nature of this revelation depends on the nature of your seclusion. It might be a great truth about the cosmos, the deities, the powerful beings of the outer planes, or the forces of nature. It could also be a site that no one else has ever seen.",
      },
      toolProficiencies: ["herbalism-kit"],
      languageChoices: { choose: 1, type: "standard" },
      equipmentOptions: {
        starting: [
          "scroll-case",
          "winter-blanket",
          "herbalism-kit",
          "common-clothes",
        ],
        gold: 5,
      },
    },
    {
      slug: "noble-phb",
      name: "Noble",
      skills: ["skill-history", "skill-persuasion"],
      feature: {
        name: "Position of Privilege",
        description:
          "Thanks to your noble birth, people are inclined to think the best of you. You are welcome in high society, and people assume you have the right to be wherever you are. The common folk make every effort to accommodate you and avoid your displeasure, and other people of high birth treat you as a member of the same social sphere. You can secure an audience with a local noble if you need to.",
      },
      languageChoices: { choose: 1, type: "standard" },
      equipmentOptions: {
        starting: ["fine-clothes", "signet-ring", "scroll-of-pedigree"],
        gold: 25,
      },
    },
    {
      slug: "sage-phb",
      name: "Sage",
      skills: ["skill-arcana", "skill-history"],
      feature: {
        name: "Researcher",
        description:
          "When you attempt to learn or recall a piece of lore, if you do not know that information, you often know where and from whom you can obtain it. Usually, this information comes from a library, scriptorium, university, or a sage or other learned person or creature. Your DM might rule that the knowledge you seek is secreted away in an almost inaccessible place, or that it simply cannot be found.",
      },
      languageChoices: { choose: 2, type: "standard" },
      equipmentOptions: {
        starting: [
          "ink",
          "quill",
          "small-knife",
          "letter-from-dead-colleague",
          "common-clothes",
        ],
        gold: 10,
      },
    },
    {
      slug: "sailor-phb",
      name: "Sailor",
      skills: ["skill-athletics", "skill-perception"],
      feature: {
        name: "Ship's Passage",
        description:
          "When you need to, you can secure free passage on a sailing ship for yourself and your adventuring companions. You might sail on the ship you served on, or another ship you have good relations with (perhaps one captained by a former crewmate). Because you're calling in a favor, you can't be certain of a schedule or route that will meet your every need. Your DM will determine how long it takes to get where you need to go. In return for your free passage, you and your companions are expected to assist the crew during the voyage.",
      },
      toolProficiencies: ["navigators-tools", "vehicles-water"],
      equipmentOptions: {
        starting: [
          "belaying-pin",
          "silk-rope",
          "lucky-charm",
          "common-clothes",
        ],
        gold: 10,
      },
    },
    {
      slug: "soldier-phb",
      name: "Soldier",
      skills: ["skill-athletics", "skill-intimidation"],
      feature: {
        name: "Military Rank",
        description:
          "You have a military rank from your career as a soldier. Soldiers loyal to your former military organization still recognize your authority and influence, and they defer to you if they are of a lower rank. You can invoke your rank to exert influence over other soldiers and requisition simple equipment or horses for temporary use. You can also usually gain access to friendly military encampments and fortresses where your rank is recognized.",
      },
      toolProficiencies: ["vehicles-land"],
      equipmentOptions: {
        starting: [
          "insignia-of-rank",
          "trophy-from-fallen-enemy",
          "dice-set",
          "common-clothes",
        ],
        gold: 10,
      },
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {

    const [phbSource] = await queryRunner.query(
      `SELECT id FROM comp_sources WHERE code = 'PHB' LIMIT 1`,
    );
    if (!phbSource) {
      console.warn("[SeedPhb2014Backgrounds] PHB source not found — skipping");
      return;
    }
    const sourceId = phbSource.id;


    const proficiencies = await queryRunner.query(
      `SELECT id, slug FROM proficiencies`,
    );
    const profMap = new Map<string, string>();
    for (const p of proficiencies) {
      profMap.set(p.slug, p.id);
    }

    for (const bg of this.backgrounds) {

      await queryRunner.query(
        `INSERT INTO backgrounds (id, slug, name, ability_scores, equipment_options, proficiency_choices, language_choices, feature, source_id, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, NULL, $3, NULL, $4, $5, $6, now(), now())
         ON CONFLICT (slug) DO NOTHING`,
        [
          bg.slug,
          bg.name,
          JSON.stringify(bg.equipmentOptions),
          bg.languageChoices ? JSON.stringify(bg.languageChoices) : null,
          JSON.stringify(bg.feature),
          sourceId,
        ],
      );


      const [bgRow] = await queryRunner.query(
        `SELECT id FROM backgrounds WHERE slug = $1`,
        [bg.slug],
      );
      if (!bgRow) continue;
      const bgId = bgRow.id;


      for (const skillSlug of bg.skills) {
        const profId = profMap.get(skillSlug);
        if (!profId) {
          console.warn(
            `[SeedPhb2014Backgrounds] Proficiency ${skillSlug} not found — skipping`,
          );
          continue;
        }
        await queryRunner.query(
          `INSERT INTO background_proficiencies (background_id, proficiency_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [bgId, profId],
        );
      }


      if (bg.toolProficiencies) {
        for (const toolSlug of bg.toolProficiencies) {
          const profId = profMap.get(toolSlug);
          if (!profId) {
            console.warn(
              `[SeedPhb2014Backgrounds] Tool proficiency ${toolSlug} not found — skipping`,
            );
            continue;
          }
          await queryRunner.query(
            `INSERT INTO background_proficiencies (background_id, proficiency_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [bgId, profId],
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const slugs = this.backgrounds.map((bg) => bg.slug);
    const placeholders = slugs.map((_, i) => `$${i + 1}`).join(",");


    await queryRunner.query(
      `DELETE FROM background_proficiencies
       WHERE background_id IN (SELECT id FROM backgrounds WHERE slug IN (${placeholders}))`,
      slugs,
    );


    await queryRunner.query(
      `DELETE FROM backgrounds WHERE slug IN (${placeholders})`,
      slugs,
    );
  }
}
