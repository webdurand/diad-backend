import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCharacterSourceId1772900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "characters"
      ADD COLUMN "source_id" uuid,
      ADD CONSTRAINT "FK_characters_source"
        FOREIGN KEY ("source_id") REFERENCES "comp_sources"("id")
        ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "characters" DROP CONSTRAINT "FK_characters_source"
    `);
    await queryRunner.query(`
      ALTER TABLE "characters" DROP COLUMN "source_id"
    `);
  }
}
