import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 012 #5 — normaliza `casting_time` com padrão malformado `"1 bonus"`
 * (sem sufixo `action`) pra `"1 bonus action"`.
 *
 * Audit no DB após rodar migration 1776950000000 (armor-of-agathys) encontrou
 * 80 spells com essa corrupção — parecem vindos de import que truncou o
 * token final. Exemplos: hex, healing-word, hunters-mark, misty-step.
 *
 * **Sem mudança de comportamento**: o backend usa `castingTime.includes('bonus')`
 * pra classificar economy, que matcha tanto `"1 bonus"` quanto `"1 bonus action"`.
 * Esta migration é **cosmética** — normaliza o shape pra que futuros consumidores
 * (UI exibir o label completo, logs mais claros, export RAW) vejam o texto correto.
 *
 * Verificação semântica individual (ex: barkskin RAW XPHB 2024 é "1 Action",
 * não "1 Bonus Action") fica em item separado do backlog — exige ler RAW spell
 * a spell.
 */
export class NormalizeSpellCastingTimeBonus1776960000000
  implements MigrationInterface
{
  name = 'NormalizeSpellCastingTimeBonus1776960000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Caso simples: "1 bonus" exato → "1 bonus action"
    await queryRunner.query(
      `UPDATE spells SET casting_time = '1 bonus action' WHERE casting_time = '1 bonus'`,
    );
    // Caso composto: "1 bonus, which you take..." → "1 bonus action, which you take..."
    // Só a vírgula logo após "bonus" distingue de um nome que começa com "bonus".
    await queryRunner.query(
      `UPDATE spells
         SET casting_time = REGEXP_REPLACE(casting_time, '^1 bonus,', '1 bonus action,')
       WHERE casting_time LIKE '1 bonus,%'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Reverter só re-introduziria o bug; manter no-op pra segurança.
  }
}
