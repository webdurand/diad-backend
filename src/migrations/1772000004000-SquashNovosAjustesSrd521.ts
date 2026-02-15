import { MigrationInterface, QueryRunner } from "typeorm";

export class SquashNovosAjustesSrd5211772000004000 implements MigrationInterface {
    name = 'SquashNovosAjustesSrd5211772000004000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "characters" DROP CONSTRAINT IF EXISTS "FK_characters_user"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_characters_user_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_users_username"`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "eldritch_invocations" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "slug" character varying NOT NULL,
                "name" character varying NOT NULL,
                "description" text NOT NULL,
                "min_level" integer,
                "prerequisite" text,
                "has_sub_choices" boolean NOT NULL DEFAULT false,
                "sub_choice_type" text,
                "sub_choice_options" jsonb,
                "source_id" uuid,
                "raw" jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_eldritch_invocations_slug" UNIQUE ("slug"),
                CONSTRAINT "PK_eldritch_invocations" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "weapon_mastery_count" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "weapon_mastery_restriction" text`);
        await queryRunner.query(`ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "cantrips_known" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "spells_prepared_count" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "spellbook_count" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "class_features_level_1" jsonb`);
        await queryRunner.query(`ALTER TABLE "backgrounds" ADD COLUMN IF NOT EXISTS "ability_scores" jsonb`);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_type WHERE typname = 'feat_type_enum'
                ) THEN
                    CREATE TYPE "public"."feat_type_enum" AS ENUM('general', 'origin', 'fighting_style', 'epic_boon', 'other');
                    ALTER TABLE "feats" ALTER COLUMN "feat_type" DROP DEFAULT;
                    ALTER TABLE "feats" ALTER COLUMN "feat_type" TYPE "public"."feat_type_enum" USING "feat_type"::"text"::"public"."feat_type_enum";
                    ALTER TABLE "feats" ALTER COLUMN "feat_type" SET DEFAULT 'general';
                ELSIF NOT EXISTS (
                    SELECT 1
                    FROM pg_type t
                    JOIN pg_enum e ON e.enumtypid = t.oid
                    WHERE t.typname = 'feat_type_enum' AND e.enumlabel = 'fighting_style'
                ) THEN
                    ALTER TYPE "public"."feat_type_enum" RENAME TO "feat_type_enum_old";
                    CREATE TYPE "public"."feat_type_enum" AS ENUM('general', 'origin', 'fighting_style', 'epic_boon', 'other');
                    ALTER TABLE "feats" ALTER COLUMN "feat_type" DROP DEFAULT;
                    ALTER TABLE "feats" ALTER COLUMN "feat_type" TYPE "public"."feat_type_enum" USING "feat_type"::"text"::"public"."feat_type_enum";
                    ALTER TABLE "feats" ALTER COLUMN "feat_type" SET DEFAULT 'general';
                    DROP TYPE "public"."feat_type_enum_old";
                END IF;
            END$$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'UQ_fe0bb3f6520ee0469504521e710'
                ) THEN
                    ALTER TABLE "users" ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username");
                END IF;
            END$$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_c6e648aeaab79e4213def02aba8'
                ) THEN
                    ALTER TABLE "characters" ADD CONSTRAINT "FK_c6e648aeaab79e4213def02aba8"
                    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
                END IF;
            END$$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_7d38e84bbd394c731a996cedc7b'
                ) THEN
                    ALTER TABLE "eldritch_invocations" ADD CONSTRAINT "FK_7d38e84bbd394c731a996cedc7b"
                    FOREIGN KEY ("source_id") REFERENCES "comp_sources"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
                END IF;
            END$$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "eldritch_invocations" DROP CONSTRAINT IF EXISTS "FK_7d38e84bbd394c731a996cedc7b"`);
        await queryRunner.query(`ALTER TABLE "characters" DROP CONSTRAINT IF EXISTS "FK_c6e648aeaab79e4213def02aba8"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_fe0bb3f6520ee0469504521e710"`);

        await queryRunner.query(`ALTER TABLE "backgrounds" DROP COLUMN IF EXISTS "ability_scores"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN IF EXISTS "class_features_level_1"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN IF EXISTS "spellbook_count"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN IF EXISTS "spells_prepared_count"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN IF EXISTS "cantrips_known"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN IF EXISTS "weapon_mastery_restriction"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN IF EXISTS "weapon_mastery_count"`);

        await queryRunner.query(`DROP TABLE IF EXISTS "eldritch_invocations"`);

        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_username" ON "users" ("username")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_characters_user_id" ON "characters" ("user_id")`);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_characters_user'
                ) THEN
                    ALTER TABLE "characters" ADD CONSTRAINT "FK_characters_user"
                    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
                END IF;
            END$$;
        `);
    }
}
