import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameEldritchToOptionalFeatures1772800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename table
    await queryRunner.query(
      `ALTER TABLE "eldritch_invocations" RENAME TO "optional_features"`,
    );

    // Add feature_type column with default for existing rows
    await queryRunner.query(`
      ALTER TABLE "optional_features"
        ADD COLUMN IF NOT EXISTS "feature_type" varchar NOT NULL DEFAULT 'eldritch_invocation'
    `);

    // Convert prerequisite from text to jsonb
    await queryRunner.query(`
      ALTER TABLE "optional_features"
        ALTER COLUMN "prerequisite" TYPE jsonb
        USING CASE
          WHEN "prerequisite" IS NULL THEN NULL
          ELSE jsonb_build_object('text', "prerequisite")
        END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert prerequisite to text
    await queryRunner.query(`
      ALTER TABLE "optional_features"
        ALTER COLUMN "prerequisite" TYPE text
        USING CASE
          WHEN "prerequisite" IS NULL THEN NULL
          ELSE "prerequisite"->>'text'
        END
    `);

    // Drop feature_type column
    await queryRunner.query(`
      ALTER TABLE "optional_features"
        DROP COLUMN IF EXISTS "feature_type"
    `);

    // Rename table back
    await queryRunner.query(
      `ALTER TABLE "optional_features" RENAME TO "eldritch_invocations"`,
    );
  }
}
