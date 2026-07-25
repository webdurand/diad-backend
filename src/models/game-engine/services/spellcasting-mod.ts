import type { CharacterSheet } from "../../characters/services/character-sheet.service";




export function getSpellcastingModifier(sheet: CharacterSheet): number {
  const casterClass = sheet.classes?.find((c) => c.spellcastingAbility != null);
  if (!casterClass?.spellcastingAbility) return 0;

  const abilityName = casterClass.spellcastingAbility.toLowerCase();
  const entry = sheet.abilityScores?.find(
    (a) =>
      a.slug?.toLowerCase() === abilityName ||
      a.name?.toLowerCase() === abilityName,
  );
  if (!entry) return 0;

  return entry.modifier ?? Math.floor((entry.score - 10) / 2);
}


export function substituteSpellcastingMod(
  template: string,
  sheet: CharacterSheet,
): string {
  const mod = getSpellcastingModifier(sheet);
  return template
    .replace(/([+-])\s*MOD\b/gi, (_match, operator: "+" | "-") => {
      const signedModifier = operator === "-" ? -mod : mod;
      return signedModifier < 0
        ? `- ${Math.abs(signedModifier)}`
        : `+ ${signedModifier}`;
    })
    .replace(/\bMOD\b/gi, String(mod));
}
