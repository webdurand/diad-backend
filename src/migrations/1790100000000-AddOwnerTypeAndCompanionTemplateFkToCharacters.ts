import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOwnerTypeAndCompanionTemplateFkToCharacters1790100000000
  implements MigrationInterface
{
  name = "AddOwnerTypeAndCompanionTemplateFkToCharacters1790100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS owner_type varchar(16) NOT NULL DEFAULT 'pc'
    `);

    await queryRunner.query(`
      ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS companion_template_id uuid
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'characters_owner_type_check'
        ) THEN
          ALTER TABLE characters
          ADD CONSTRAINT characters_owner_type_check
          CHECK (owner_type IN ('pc','companion'));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE characters
      DROP CONSTRAINT IF EXISTS fk_characters_companion_template
    `);

    await queryRunner.query(`
      ALTER TABLE characters
      ADD CONSTRAINT fk_characters_companion_template
      FOREIGN KEY (companion_template_id)
      REFERENCES companion_templates(id) ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_characters_owner_type
      ON characters (owner_type)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_characters_user_owner_type
      ON characters (user_id, owner_type)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_characters_companion_template
      ON characters (companion_template_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_characters_companion_template
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_characters_user_owner_type
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_characters_owner_type
    `);
    await queryRunner.query(`
      ALTER TABLE characters
      DROP CONSTRAINT IF EXISTS fk_characters_companion_template
    `);
    await queryRunner.query(`
      ALTER TABLE characters
      DROP CONSTRAINT IF EXISTS characters_owner_type_check
    `);
    await queryRunner.query(`
      ALTER TABLE characters
      DROP COLUMN IF EXISTS companion_template_id
    `);
    await queryRunner.query(`
      ALTER TABLE characters
      DROP COLUMN IF EXISTS owner_type
    `);
  }
}
