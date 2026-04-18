import type { CharacterSheet } from '../../characters/services/character-sheet.service';

/**
 * Helpers pra normalizar expressões de dano/cura vindas do catálogo SRD.
 *
 * Contexto: `heal_at_slot_level` / `damage_at_slot_level` no DB podem conter
 * placeholders (`MOD`) que representam o modificador de spellcasting do
 * caster. Sem substituição, `DiceService.rollExpression("1d4 + MOD")` devolve
 * 0 (regex não bate). Este módulo isola a substituição.
 */

/**
 * Retorna o modificador da ability de spellcasting primária do caster, ou 0
 * se a sheet não expõe caster class (multi-class sem caster, monge, etc.).
 *
 * Usa a primeira `ClassBlock` com `spellcastingAbility` — multi-class
 * caster (e.g., Fighter 1 / Wizard 5) escolhe o caster.
 */
export function getSpellcastingModifier(sheet: CharacterSheet): number {
  const casterClass = sheet.classes?.find(
    (c) => c.spellcastingAbility != null,
  );
  if (!casterClass?.spellcastingAbility) return 0;

  const abilityName = casterClass.spellcastingAbility.toLowerCase();
  const entry = sheet.abilityScores?.find(
    (a) => a.slug?.toLowerCase() === abilityName || a.name?.toLowerCase() === abilityName,
  );
  if (!entry) return 0;

  return entry.modifier ?? Math.floor((entry.score - 10) / 2);
}

/**
 * Substitui o placeholder `MOD` (word-boundary, case-insensitive) pelo
 * modificador numérico do caster. Preserva o resto da expressão.
 *
 * Exemplos:
 *   "1d4 + MOD", mod=3    → "1d4 + 3"
 *   "2d4 + MOD", mod=-1   → "2d4 + -1" (diceService aceita)
 *   "1d8",       qualquer → "1d8" (unchanged)
 */
export function substituteSpellcastingMod(
  template: string,
  sheet: CharacterSheet,
): string {
  const mod = getSpellcastingModifier(sheet);
  return template.replace(/\bMOD\b/gi, String(mod));
}
