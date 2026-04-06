import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCharacterFkIndexes1773000000000 implements MigrationInterface {
  name = 'AddCharacterFkIndexes1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Indexes on character_id foreign keys for query performance
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_character_classes_character_id" ON "character_classes" ("character_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_character_ability_scores_character_id" ON "character_ability_scores" ("character_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_character_skills_character_id" ON "character_skills" ("character_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_character_spells_character_id" ON "character_spells" ("character_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_character_equipment_character_id" ON "character_equipment" ("character_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_character_proficiencies_character_id" ON "character_proficiencies" ("character_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_character_magic_items_character_id" ON "character_magic_items" ("character_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_character_level_ups_character_id" ON "character_level_ups" ("character_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_character_features_character_id" ON "character_features" ("character_id")`);

    // Index on characters.user_id for listByUser queries
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_characters_user_id" ON "characters" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_characters_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_character_features_character_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_character_level_ups_character_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_character_magic_items_character_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_character_proficiencies_character_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_character_equipment_character_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_character_spells_character_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_character_skills_character_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_character_ability_scores_character_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_character_classes_character_id"`);
  }
}
