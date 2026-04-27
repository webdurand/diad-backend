import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateKnowledgeDocuments1774600000000 implements MigrationInterface {
  name = "CreateKnowledgeDocuments1774600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "knowledge_documents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL,
        "url" varchar NOT NULL,
        "cloudinary_public_id" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'processing',
        "chunks" int NOT NULL DEFAULT 0,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "knowledge_documents"`);
  }
}
