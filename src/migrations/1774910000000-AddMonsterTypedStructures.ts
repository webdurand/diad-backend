import { MigrationInterface, QueryRunner } from "typeorm";


export class AddMonsterTypedStructures1774910000000 implements MigrationInterface {
  name = "AddMonsterTypedStructures1774910000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE monsters
        ADD COLUMN multiattack jsonb,
        ADD COLUMN spellcasting jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE encounter_participants
        ADD COLUMN spell_slots_used jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE encounter_participants DROP COLUMN spell_slots_used
    `);
    await queryRunner.query(`
      ALTER TABLE monsters
        DROP COLUMN spellcasting,
        DROP COLUMN multiattack
    `);
  }
}
