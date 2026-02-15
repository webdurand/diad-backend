import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCharacterRelationalTables1772100000000 implements MigrationInterface {
  name = 'AddCharacterRelationalTables1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Enums ---
    await queryRunner.query(`
      CREATE TYPE "character_proficiency_source_enum"
      AS ENUM ('class', 'race', 'background', 'multiclass', 'feat')
    `);
    await queryRunner.query(`
      CREATE TYPE "spell_source_enum"
      AS ENUM ('class', 'race', 'feat', 'item')
    `);
    await queryRunner.query(`
      CREATE TYPE "spell_status_enum"
      AS ENUM ('known', 'prepared', 'spellbook')
    `);
    await queryRunner.query(`
      CREATE TYPE "equipment_source_enum"
      AS ENUM ('starting', 'bought', 'loot')
    `);
    await queryRunner.query(`
      CREATE TYPE "hp_method_enum"
      AS ENUM ('roll', 'fixed')
    `);

    // --- character_classes ---
    await queryRunner.query(`
      CREATE TABLE "character_classes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "character_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "subclass_id" uuid,
        "class_level" integer NOT NULL DEFAULT 1,
        "order" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_character_classes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_character_classes_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_character_classes_class" FOREIGN KEY ("class_id")
          REFERENCES "classes"("id"),
        CONSTRAINT "FK_character_classes_subclass" FOREIGN KEY ("subclass_id")
          REFERENCES "subclasses"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_cc_character" ON "character_classes" ("character_id")`);

    // --- character_ability_scores ---
    await queryRunner.query(`
      CREATE TABLE "character_ability_scores" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "character_id" uuid NOT NULL,
        "ability_score_id" uuid NOT NULL,
        "base_score" integer NOT NULL,
        "bonus" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_character_ability_scores" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cas_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cas_ability_score" FOREIGN KEY ("ability_score_id")
          REFERENCES "ability_scores"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_cas_character" ON "character_ability_scores" ("character_id")`);

    // --- character_skills ---
    await queryRunner.query(`
      CREATE TABLE "character_skills" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "character_id" uuid NOT NULL,
        "skill_id" uuid NOT NULL,
        "expertise" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_character_skills" PRIMARY KEY ("id"),
        CONSTRAINT "FK_csk_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_csk_skill" FOREIGN KEY ("skill_id")
          REFERENCES "skills"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_csk_character" ON "character_skills" ("character_id")`);

    // --- character_proficiencies ---
    await queryRunner.query(`
      CREATE TABLE "character_proficiencies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "character_id" uuid NOT NULL,
        "proficiency_id" uuid NOT NULL,
        "source" "character_proficiency_source_enum" NOT NULL,
        CONSTRAINT "PK_character_proficiencies" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cp_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cp_proficiency" FOREIGN KEY ("proficiency_id")
          REFERENCES "proficiencies"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_cp_character" ON "character_proficiencies" ("character_id")`);

    // --- character_spells ---
    await queryRunner.query(`
      CREATE TABLE "character_spells" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "character_id" uuid NOT NULL,
        "spell_id" uuid NOT NULL,
        "source" "spell_source_enum" NOT NULL,
        "status" "spell_status_enum" NOT NULL,
        "always_prepared" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_character_spells" PRIMARY KEY ("id"),
        CONSTRAINT "FK_csp_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_csp_spell" FOREIGN KEY ("spell_id")
          REFERENCES "spells"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_csp_character" ON "character_spells" ("character_id")`);

    // --- character_equipment ---
    await queryRunner.query(`
      CREATE TABLE "character_equipment" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "character_id" uuid NOT NULL,
        "equipment_id" uuid NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "equipped" boolean NOT NULL DEFAULT false,
        "source" "equipment_source_enum" NOT NULL DEFAULT 'starting',
        CONSTRAINT "PK_character_equipment" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ce_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ce_equipment" FOREIGN KEY ("equipment_id")
          REFERENCES "equipments"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ce_character" ON "character_equipment" ("character_id")`);

    // --- character_magic_items ---
    await queryRunner.query(`
      CREATE TABLE "character_magic_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "character_id" uuid NOT NULL,
        "magic_item_id" uuid NOT NULL,
        "attuned" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_character_magic_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cmi_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cmi_magic_item" FOREIGN KEY ("magic_item_id")
          REFERENCES "magic_items"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_cmi_character" ON "character_magic_items" ("character_id")`);

    // --- character_state ---
    await queryRunner.query(`
      CREATE TABLE "character_state" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "character_id" uuid NOT NULL,
        "current_hp" integer NOT NULL DEFAULT 0,
        "temp_hp" integer NOT NULL DEFAULT 0,
        "max_hp_bonus" integer NOT NULL DEFAULT 0,
        "xp" integer NOT NULL DEFAULT 0,
        "cp" integer NOT NULL DEFAULT 0,
        "sp" integer NOT NULL DEFAULT 0,
        "gp" integer NOT NULL DEFAULT 0,
        "pp" integer NOT NULL DEFAULT 0,
        "death_saves_success" integer NOT NULL DEFAULT 0,
        "death_saves_fail" integer NOT NULL DEFAULT 0,
        "conditions" jsonb NOT NULL DEFAULT '[]',
        "spell_slots_used" jsonb NOT NULL DEFAULT '{}',
        "hit_dice_used" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_character_state" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cs_character" UNIQUE ("character_id"),
        CONSTRAINT "FK_cs_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE CASCADE
      )
    `);

    // --- character_level_ups ---
    await queryRunner.query(`
      CREATE TABLE "character_level_ups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "character_id" uuid NOT NULL,
        "total_level" integer NOT NULL,
        "class_id" uuid NOT NULL,
        "hp_gained" integer NOT NULL,
        "hp_method" "hp_method_enum" NOT NULL,
        "choices" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_character_level_ups" PRIMARY KEY ("id"),
        CONSTRAINT "FK_clu_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_clu_class" FOREIGN KEY ("class_id")
          REFERENCES "classes"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_clu_character" ON "character_level_ups" ("character_id")`);

    // --- character_features ---
    await queryRunner.query(`
      CREATE TABLE "character_features" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "character_id" uuid NOT NULL,
        "feature_id" uuid NOT NULL,
        "source_class_id" uuid,
        "active" boolean NOT NULL DEFAULT true,
        "choices" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_character_features" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cf_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cf_feature" FOREIGN KEY ("feature_id")
          REFERENCES "features"("id"),
        CONSTRAINT "FK_cf_source_class" FOREIGN KEY ("source_class_id")
          REFERENCES "classes"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_cf_character" ON "character_features" ("character_id")`);

    // --- character_origins ---
    await queryRunner.query(`
      CREATE TABLE "character_origins" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "character_id" uuid NOT NULL,
        "race_id" uuid NOT NULL,
        "subrace_id" uuid,
        "background_id" uuid NOT NULL,
        "alignment_id" uuid,
        "personality" jsonb NOT NULL DEFAULT '{}',
        "species_size" character varying,
        "species_spellcasting_ability" character varying,
        "age" character varying,
        "height" character varying,
        "weight" character varying,
        "ability_score_method" character varying,
        "race_trait_choices" jsonb NOT NULL DEFAULT '[]',
        "race_feat_choice" character varying,
        "divine_order" character varying,
        "primal_order" character varying,
        "fighting_style_index" character varying,
        "class_equipment_choices" jsonb NOT NULL DEFAULT '[]',
        "background_equipment_choices" jsonb NOT NULL DEFAULT '[]',
        "class_starting_gold" jsonb,
        "eldritch_invocations" jsonb NOT NULL DEFAULT '[]',
        "eldritch_invocation_sub_choices" jsonb,
        "weapon_mastery_choices" jsonb NOT NULL DEFAULT '[]',
        "class_language_choices" jsonb NOT NULL DEFAULT '[]',
        "class_tool_proficiency" character varying,
        CONSTRAINT "PK_character_origins" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_co_character" UNIQUE ("character_id"),
        CONSTRAINT "FK_co_character" FOREIGN KEY ("character_id")
          REFERENCES "characters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_co_race" FOREIGN KEY ("race_id")
          REFERENCES "races"("id"),
        CONSTRAINT "FK_co_subrace" FOREIGN KEY ("subrace_id")
          REFERENCES "subraces"("id"),
        CONSTRAINT "FK_co_background" FOREIGN KEY ("background_id")
          REFERENCES "backgrounds"("id"),
        CONSTRAINT "FK_co_alignment" FOREIGN KEY ("alignment_id")
          REFERENCES "alignments"("id")
      )
    `);

    // --- Make data column nullable (backup) ---
    await queryRunner.query(`ALTER TABLE "characters" ALTER COLUMN "data" DROP NOT NULL`);

    // --- Migrate existing data ---
    await this.migrateExistingCharacters(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "characters" ALTER COLUMN "data" SET NOT NULL`);

    await queryRunner.query(`DROP TABLE IF EXISTS "character_origins"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "character_features"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "character_level_ups"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "character_state"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "character_magic_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "character_equipment"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "character_spells"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "character_proficiencies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "character_skills"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "character_ability_scores"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "character_classes"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "hp_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "equipment_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "spell_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "spell_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "character_proficiency_source_enum"`);
  }

  private async migrateExistingCharacters(queryRunner: QueryRunner): Promise<void> {
    const characters = await queryRunner.query(
      `SELECT id, data FROM characters WHERE data IS NOT NULL`,
    );

    for (const char of characters) {
      const data = char.data;
      if (!data || typeof data !== 'object') continue;

      try {
        await this.migrateOne(queryRunner, char.id, data);
      } catch (err) {
        console.warn(`Falha ao migrar personagem ${char.id}:`, err);
      }
    }
  }

  private async migrateOne(
    queryRunner: QueryRunner,
    characterId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    // Resolve slugs to UUIDs
    const classSlug = data.classIndex as string | undefined;
    const raceSlug = data.raceIndex as string | undefined;
    const subraceSlug = data.subraceIndex as string | undefined;
    const backgroundSlug = data.backgroundIndex as string | undefined;
    const alignmentSlug = data.alignmentIndex as string | undefined;

    if (!classSlug || !raceSlug || !backgroundSlug) return;

    const [classRow] = await queryRunner.query(
      `SELECT id, hit_die FROM classes WHERE slug = $1`,
      [classSlug],
    );
    if (!classRow) return;

    const [raceRow] = await queryRunner.query(
      `SELECT id, speed FROM races WHERE slug = $1`,
      [raceSlug],
    );
    if (!raceRow) return;

    const [backgroundRow] = await queryRunner.query(
      `SELECT id FROM backgrounds WHERE slug = $1`,
      [backgroundSlug],
    );
    if (!backgroundRow) return;

    let subraceId: string | null = null;
    if (subraceSlug) {
      const [row] = await queryRunner.query(
        `SELECT id FROM subraces WHERE slug = $1`,
        [subraceSlug],
      );
      subraceId = row?.id ?? null;
    }

    let alignmentId: string | null = null;
    if (alignmentSlug) {
      const [row] = await queryRunner.query(
        `SELECT id FROM alignments WHERE slug = $1`,
        [alignmentSlug],
      );
      alignmentId = row?.id ?? null;
    }

    // character_classes
    await queryRunner.query(
      `INSERT INTO character_classes (character_id, class_id, class_level, "order")
       VALUES ($1, $2, 1, 1)`,
      [characterId, classRow.id],
    );

    // character_ability_scores
    const scores = data.abilityScores as Record<string, number> | undefined;
    const bgBonuses = (data.backgroundAbilityBonuses ?? []) as Array<{
      abilityScoreIndex: string;
      bonus: number;
    }>;
    const slugMap: Record<string, string> = {
      strength: 'str',
      dexterity: 'dex',
      constitution: 'con',
      intelligence: 'int',
      wisdom: 'wis',
      charisma: 'cha',
    };
    if (scores) {
      for (const [key, value] of Object.entries(scores)) {
        const slug = slugMap[key];
        if (!slug) continue;
        const [asRow] = await queryRunner.query(
          `SELECT id FROM ability_scores WHERE slug = $1`,
          [slug],
        );
        if (!asRow) continue;
        const bgBonus =
          bgBonuses.find((b) => b.abilityScoreIndex === slug)?.bonus ?? 0;
        await queryRunner.query(
          `INSERT INTO character_ability_scores (character_id, ability_score_id, base_score, bonus)
           VALUES ($1, $2, $3, $4)`,
          [characterId, asRow.id, value, bgBonus],
        );
      }
    }

    // character_skills
    const skillSlugs = (data.skills ?? []) as string[];
    const expertiseSlugs = (data.expertiseSkills ?? []) as string[];
    for (const slug of skillSlugs) {
      const [row] = await queryRunner.query(
        `SELECT id FROM skills WHERE slug = $1`,
        [slug],
      );
      if (!row) continue;
      await queryRunner.query(
        `INSERT INTO character_skills (character_id, skill_id, expertise)
         VALUES ($1, $2, $3)`,
        [characterId, row.id, expertiseSlugs.includes(slug)],
      );
    }
    // expertise skills not already in skills list
    for (const slug of expertiseSlugs) {
      if (skillSlugs.includes(slug)) continue;
      const [row] = await queryRunner.query(
        `SELECT id FROM skills WHERE slug = $1`,
        [slug],
      );
      if (!row) continue;
      await queryRunner.query(
        `INSERT INTO character_skills (character_id, skill_id, expertise)
         VALUES ($1, $2, true)`,
        [characterId, row.id],
      );
    }

    // character_proficiencies
    const raceProfSlugs = (data.raceProficiencyChoices ?? []) as string[];
    const bgProfSlugs = (data.backgroundProficiencyChoices ?? []) as string[];
    for (const slug of raceProfSlugs) {
      const [row] = await queryRunner.query(
        `SELECT id FROM proficiencies WHERE slug = $1`,
        [slug],
      );
      if (!row) continue;
      await queryRunner.query(
        `INSERT INTO character_proficiencies (character_id, proficiency_id, source)
         VALUES ($1, $2, 'race')`,
        [characterId, row.id],
      );
    }
    for (const slug of bgProfSlugs) {
      const [row] = await queryRunner.query(
        `SELECT id FROM proficiencies WHERE slug = $1`,
        [slug],
      );
      if (!row) continue;
      await queryRunner.query(
        `INSERT INTO character_proficiencies (character_id, proficiency_id, source)
         VALUES ($1, $2, 'background')`,
        [characterId, row.id],
      );
    }

    // character_spells (cantrips, prepared, spellbook, race spells)
    const cantripSlugs = (data.classCantrips ?? []) as string[];
    const preparedSlugs = (data.classPreparedSpells ?? []) as string[];
    const spellbookSlugs = (data.classSpellbook ?? []) as string[];
    const raceSpellSlugs = (data.raceSpellChoices ?? []) as string[];

    for (const slug of cantripSlugs) {
      const [row] = await queryRunner.query(
        `SELECT id FROM spells WHERE slug = $1`,
        [slug],
      );
      if (!row) continue;
      await queryRunner.query(
        `INSERT INTO character_spells (character_id, spell_id, source, status, always_prepared)
         VALUES ($1, $2, 'class', 'known', true)`,
        [characterId, row.id],
      );
    }
    for (const slug of preparedSlugs) {
      const [row] = await queryRunner.query(
        `SELECT id FROM spells WHERE slug = $1`,
        [slug],
      );
      if (!row) continue;
      await queryRunner.query(
        `INSERT INTO character_spells (character_id, spell_id, source, status, always_prepared)
         VALUES ($1, $2, 'class', 'prepared', false)`,
        [characterId, row.id],
      );
    }
    for (const slug of spellbookSlugs) {
      const [row] = await queryRunner.query(
        `SELECT id FROM spells WHERE slug = $1`,
        [slug],
      );
      if (!row) continue;
      await queryRunner.query(
        `INSERT INTO character_spells (character_id, spell_id, source, status, always_prepared)
         VALUES ($1, $2, 'class', 'spellbook', false)`,
        [characterId, row.id],
      );
    }
    for (const slug of raceSpellSlugs) {
      const [row] = await queryRunner.query(
        `SELECT id FROM spells WHERE slug = $1`,
        [slug],
      );
      if (!row) continue;
      await queryRunner.query(
        `INSERT INTO character_spells (character_id, spell_id, source, status, always_prepared)
         VALUES ($1, $2, 'race', 'known', true)`,
        [characterId, row.id],
      );
    }

    // character_state — level 1 HP = hit_die + CON mod
    const conScore = scores?.constitution ?? 10;
    const conMod = Math.floor((conScore + (bgBonuses.find((b) => b.abilityScoreIndex === 'con')?.bonus ?? 0) - 10) / 2);
    const startHp = (classRow.hit_die as number) + conMod;

    // Starting gold
    const startingGold = data.classStartingGold as { amount?: number } | undefined;
    const gp = startingGold?.amount ?? 0;

    await queryRunner.query(
      `INSERT INTO character_state (character_id, current_hp, gp)
       VALUES ($1, $2, $3)`,
      [characterId, startHp, gp],
    );

    // character_origins
    const personality = (data.personality ?? {}) as Record<string, string>;
    await queryRunner.query(
      `INSERT INTO character_origins (
        character_id, race_id, subrace_id, background_id, alignment_id,
        personality, species_size, species_spellcasting_ability,
        age, height, weight, ability_score_method,
        race_trait_choices, race_feat_choice,
        divine_order, primal_order, fighting_style_index,
        class_equipment_choices, background_equipment_choices,
        class_starting_gold, eldritch_invocations,
        eldritch_invocation_sub_choices,
        weapon_mastery_choices, class_language_choices,
        class_tool_proficiency
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14,
        $15, $16, $17,
        $18, $19,
        $20, $21,
        $22,
        $23, $24,
        $25
      )`,
      [
        characterId,
        raceRow.id,
        subraceId,
        backgroundRow.id,
        alignmentId,
        JSON.stringify(personality),
        (data.speciesSize as string) ?? null,
        (data.speciesSpellcastingAbility as string) ?? null,
        (data.age as string) ?? null,
        (data.height as string) ?? null,
        (data.weight as string) ?? null,
        (data.abilityScoreMethod as string) ?? null,
        JSON.stringify(data.raceTraitChoices ?? []),
        (data.raceFeatChoiceIndex as string) ?? null,
        (data.divineOrder as string) ?? null,
        (data.primalOrder as string) ?? null,
        (data.fightingStyleIndex as string) ?? null,
        JSON.stringify(data.classEquipmentChoices ?? []),
        JSON.stringify(data.backgroundEquipmentChoices ?? []),
        data.classStartingGold ? JSON.stringify(data.classStartingGold) : null,
        JSON.stringify(data.eldritchInvocations ?? []),
        data.eldritchInvocationSubChoices
          ? JSON.stringify(data.eldritchInvocationSubChoices)
          : null,
        JSON.stringify(data.weaponMasteryChoices ?? []),
        JSON.stringify(data.classLanguageChoices ?? []),
        (data.classToolProficiency as string) ?? null,
      ],
    );
  }
}
