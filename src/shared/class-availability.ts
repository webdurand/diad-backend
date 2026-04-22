/**
 * Canonical-first policy (spec 012).
 *
 * Classes e subclasses 100% validadas em tela (RAW 2024 XPHB) aparecem ao jogador.
 * Itens incompletos ficam ocultos até serem enviados em um release futuro.
 *
 * Admin seed (/admin/seed-character) bypassa este filtro — usado pelo harness.
 *
 * Ao concluir a próxima classe/subclasse canônica, atualizar aqui.
 */

export interface ClassAvailability {
  /** Classe pode ser escolhida na criação e no level-up multiclasse. */
  available: boolean;
  /**
   * Slugs de subclasse (como persistidos em `subclasses.slug`) que aparecem
   * no picker de subclasse. Outros slugs da mesma classe ficam ocultos.
   */
  canonicalSubclasses: string[];
}

export const CLASS_AVAILABILITY: Record<string, ClassAvailability> = {
  fighter: { available: true, canonicalSubclasses: ['champion'] },
  barbarian: { available: true, canonicalSubclasses: ['berserker'] },
  cleric: { available: true, canonicalSubclasses: ['life'] },
  paladin: { available: true, canonicalSubclasses: ['devotion'] },
  wizard: { available: true, canonicalSubclasses: ['evocation'] },
  sorcerer: { available: true, canonicalSubclasses: ['draconic'] },
  // Druid L1-L20 + Land canonical liberado (Sprint C+D do spec 012).
  // Wild Shape (Transformation) + Conjure Animals (Summoning) em tela.
  druid: { available: true, canonicalSubclasses: ['druid-land', 'land'] },
  // Bard L1-L20 + Lore canonical liberado. Bardic Inspiration + spellcasting em tela.
  bard: { available: true, canonicalSubclasses: ['bard-lore', 'lore'] },
  // Marco C — a liberar conforme cada classe fecha L1-L20 + 1 canônica RAW
  warlock: { available: false, canonicalSubclasses: [] },
  monk: { available: false, canonicalSubclasses: [] },
  rogue: { available: false, canonicalSubclasses: [] },
  ranger: { available: false, canonicalSubclasses: [] },
};

function canonicalizeClassSlug(slug: string): string {
  return slug.replace(/-phb$/, '');
}

export function isClassAvailable(classSlug: string): boolean {
  return CLASS_AVAILABILITY[canonicalizeClassSlug(classSlug)]?.available ?? false;
}

export function getCanonicalSubclassSlugs(classSlug: string): string[] {
  return CLASS_AVAILABILITY[canonicalizeClassSlug(classSlug)]?.canonicalSubclasses ?? [];
}
