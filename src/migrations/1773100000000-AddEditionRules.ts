import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEditionRules1773100000000 implements MigrationInterface {
  name = "AddEditionRules1773100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comp_sources" ADD COLUMN IF NOT EXISTS "rules" jsonb`,
    );

    // Seed rules for PHB (2014) and XPHB (2024)
    await queryRunner.query(
      `
      UPDATE "comp_sources" SET "rules" = $1 WHERE "code" = 'PHB'
    `,
      [
        JSON.stringify({
          subclassLevels: {
            cleric: 1,
            druid: 2,
            sorcerer: 1,
            warlock: 1,
            wizard: 2,
            default: 3,
          },
          casterTypes: { ranger: "known" },
          preparedFormulas: { paladin: "halfLevel+mod" },
          hasWeaponMastery: false,
          hasDivineOrder: false,
          hasPrimalOrder: false,
          backgroundGrantsFeat: false,
          backgroundGrantsAbilityBonuses: false,
        }),
      ],
    );

    await queryRunner.query(
      `
      UPDATE "comp_sources" SET "rules" = $1 WHERE "code" = 'XPHB'
    `,
      [
        JSON.stringify({
          subclassLevels: { default: 3 },
          casterTypes: { ranger: "total_access" },
          preparedFormulas: { paladin: "level+mod" },
          hasWeaponMastery: true,
          hasDivineOrder: true,
          hasPrimalOrder: true,
          backgroundGrantsFeat: true,
          backgroundGrantsAbilityBonuses: true,
        }),
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comp_sources" DROP COLUMN IF EXISTS "rules"`,
    );
  }
}
