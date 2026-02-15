import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConsumableEffects1772200000000 implements MigrationInterface {
  name = 'AddConsumableEffects1772200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equipments" ADD COLUMN IF NOT EXISTS "consumable_effect" jsonb`,
    );

    const effects: Array<{
      slug: string;
      effect: Record<string, unknown>;
    }> = [
      {
        slug: 'potion-of-healing',
        effect: {
          type: 'healing',
          label: 'Recupera 2d4+2 HP',
          dice: '2d4+2',
          damageType: 'Hit Points',
          actionCost: 'bonus_action',
          consumesCharge: true,
          autoApply: true,
        },
      },
      {
        slug: 'acid',
        effect: {
          type: 'damage',
          label: '2d6 dano Acido (arremesso)',
          dice: '2d6',
          damageType: 'Acid',
          actionCost: 'action',
          consumesCharge: true,
          range: 20,
          saveDc: {
            ability: 'DEX',
            base: 8,
            addDexMod: true,
            addProfBonus: true,
          },
          autoApply: false,
        },
      },
      {
        slug: 'alchemists-fire',
        effect: {
          type: 'damage',
          label: '1d4 dano de Fogo por turno',
          dice: '1d4',
          damageType: 'Fire',
          actionCost: 'action',
          consumesCharge: true,
          range: 20,
          saveDc: {
            ability: 'DEX',
            base: 8,
            addDexMod: true,
            addProfBonus: true,
          },
          autoApply: false,
        },
      },
      {
        slug: 'antitoxin',
        effect: {
          type: 'condition',
          label: 'Vantagem vs Envenenado (1h)',
          actionCost: 'bonus_action',
          consumesCharge: true,
          autoApply: false,
        },
      },
      {
        slug: 'holy-water',
        effect: {
          type: 'damage',
          label: '2d8 dano Radiante (Fiend/Undead)',
          dice: '2d8',
          damageType: 'Radiant',
          actionCost: 'action',
          consumesCharge: true,
          range: 20,
          saveDc: {
            ability: 'DEX',
            base: 8,
            addDexMod: true,
            addProfBonus: true,
          },
          autoApply: false,
        },
      },
      {
        slug: 'poison-basic',
        effect: {
          type: 'damage',
          label: '1d4 dano de Veneno',
          dice: '1d4',
          damageType: 'Poison',
          actionCost: 'action',
          consumesCharge: true,
          autoApply: false,
        },
      },
      {
        slug: 'healers-kit',
        effect: {
          type: 'utility',
          label: 'Estabiliza criatura com 0 HP',
          actionCost: 'action',
          consumesCharge: true,
          autoApply: false,
        },
      },
      {
        slug: 'oil',
        effect: {
          type: 'utility',
          label: 'Cobre alvo em oleo / combustivel',
          actionCost: 'action',
          consumesCharge: true,
          autoApply: false,
        },
      },
      {
        slug: 'torch',
        effect: {
          type: 'utility',
          label: 'Luz brilhante 20ft / 1 dano de Fogo',
          dice: '1',
          damageType: 'Fire',
          actionCost: 'action',
          consumesCharge: true,
          autoApply: false,
        },
      },
      {
        slug: 'caltrops',
        effect: {
          type: 'utility',
          label: 'Cobre area 5ft, causa dano e reduz velocidade',
          actionCost: 'action',
          consumesCharge: true,
          autoApply: false,
        },
      },
      {
        slug: 'ball-bearings',
        effect: {
          type: 'utility',
          label: 'Cobre area 10ft, pode derrubar',
          actionCost: 'action',
          consumesCharge: true,
          autoApply: false,
        },
      },
    ];

    for (const { slug, effect } of effects) {
      await queryRunner.query(
        `UPDATE "equipments" SET "consumable_effect" = $1 WHERE "slug" = $2`,
        [JSON.stringify(effect), slug],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equipments" DROP COLUMN IF EXISTS "consumable_effect"`,
    );
  }
}
