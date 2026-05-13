import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameEldritchToOptionalFeatures1772800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query(
      `ALTER TABLE "eldritch_invocations" RENAME TO "optional_features"`,
    );


    await queryRunner.query(`
      ALTER TABLE "optional_features"
        ADD COLUMN IF NOT EXISTS "feature_type" varchar NOT NULL DEFAULT 'eldritch_invocation'
    `);


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

    await queryRunner.query(`
      ALTER TABLE "optional_features"
        ALTER COLUMN "prerequisite" TYPE text
        USING CASE
          WHEN "prerequisite" IS NULL THEN NULL
          ELSE "prerequisite"->>'text'
        END
    `);


    await queryRunner.query(`
      ALTER TABLE "optional_features"
        DROP COLUMN IF EXISTS "feature_type"
    `);


    await queryRunner.query(
      `ALTER TABLE "optional_features" RENAME TO "eldritch_invocations"`,
    );
  }
}
