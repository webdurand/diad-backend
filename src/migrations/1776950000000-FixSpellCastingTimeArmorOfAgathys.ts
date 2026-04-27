import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 012 #3 — corrigir `casting_time` de Armor of Agathys.
 *
 * DB importou `"1 bonus"` (malformado, provavelmente vindo de um scrape
 * que cortou "action" no final). RAW XPHB 2024 E PHB 2014 dizem:
 *   Armor of Agathys: Casting Time = 1 Action.
 *
 * O backend usa `casting_time.includes('bonus')` pra determinar action
 * economy — com o valor corrompido, marcava `bonusActionUsed` em vez de
 * `actionUsed`, invalidando o invariant `action-consumes-action-slot`
 * no scenario warlock-L1.
 *
 * Migration pontual pra esse spell. Um audit completo de outras magias
 * com casting_time malformado fica no backlog (spec 012 investigation).
 */
export class FixSpellCastingTimeArmorOfAgathys1776950000000 implements MigrationInterface {
  name = "FixSpellCastingTimeArmorOfAgathys1776950000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE spells SET casting_time = '1 action' WHERE slug = 'armor-of-agathys' AND casting_time <> '1 action'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // No-op: não há valor "correto" pra reverter pra um estado malformado.
  }
}
