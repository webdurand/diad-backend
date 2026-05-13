import { MigrationInterface, QueryRunner } from "typeorm";


export class CreateLoreEntry1778050000000 implements MigrationInterface {
  name = "CreateLoreEntry1778050000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS lore_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        description TEXT NOT NULL,
        activation_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
        entity_type VARCHAR NOT NULL DEFAULT 'lore',
        entity_id UUID NULL,
        is_persistent BOOLEAN NOT NULL DEFAULT true,
        priority SMALLINT NOT NULL DEFAULT 5,
        max_tokens_inject INT NOT NULL DEFAULT 400,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT lore_entries_entity_type_check CHECK (entity_type IN
          ('npc','location','faction','lore','item')),
        CONSTRAINT lore_entries_priority_range CHECK (priority BETWEEN 0 AND 10)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_lore_entries_campaign_id
         ON lore_entries(campaign_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_lore_entries_activation_keys
         ON lore_entries USING GIN (activation_keys jsonb_path_ops)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_lore_entries_activation_keys`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_lore_entries_campaign_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS lore_entries`);
  }
}
