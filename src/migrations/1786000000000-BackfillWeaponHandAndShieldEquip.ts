import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Harmoniza estado de char_equipment pra invariante "arma em uso = empunhada".
 *
 * Antes desta migration o front da ficha tinha 2 botões (toggleEquip + setHand)
 * disjuntos. PCs criados clicando só em "Equipar" ficaram com:
 *   equipped=true, main_hand=false, off_hand=false
 * mas o combate (`actions.service.buildWeaponActions`) filtra por
 * `main_hand || off_hand`. Resultado: arma equipada só aparecia como
 * "Ataque Desarmado" no combate.
 *
 * Backfill:
 *  1. Armas equipadas sem mão definida → main_hand=true (default RAW: empunha
 *     na principal).
 *  2. Escudos equipados sem mão definida → off_hand=true (RAW: escudo vai em
 *     off; mantém equipped=true porque AC calc lê esse campo).
 *
 * Ambos statements são idempotentes (filtros exigem main_hand=false E off_hand=false).
 */
export class BackfillWeaponHandAndShieldEquip1786000000000 implements MigrationInterface {
  name = "BackfillWeaponHandAndShieldEquip1786000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE character_equipment ce
      SET main_hand = true
      WHERE ce.equipped = true
        AND ce.main_hand = false
        AND ce.off_hand = false
        AND EXISTS (
          SELECT 1 FROM equipments e
          WHERE e.id = ce.equipment_id
            AND e.damage IS NOT NULL
            AND e.slug NOT LIKE '%shield%'
            AND LOWER(e.name) NOT LIKE '%shield%'
        )
    `);

    await queryRunner.query(`
      UPDATE character_equipment ce
      SET off_hand = true
      WHERE ce.equipped = true
        AND ce.main_hand = false
        AND ce.off_hand = false
        AND EXISTS (
          SELECT 1 FROM equipments e
          WHERE e.id = ce.equipment_id
            AND (e.slug LIKE '%shield%' OR LOWER(e.name) LIKE '%shield%')
        )
    `);
  }

  async down(): Promise<void> {
    // Noop: o estado anterior (equipped=true, mãos vazias) representa o bug
    // que esta migration corrige; restaurá-lo reintroduziria o problema.
  }
}
