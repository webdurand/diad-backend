import { SpellEntity } from 'src/entities/spell.entity';

/**
 * Spec 005 US14 — utilitários para decidir quantos alvos uma magia aceita.
 *
 * Três grupos de magias:
 *  - **AoE** (`spell.area_of_effect != null`): forma define os alvos; backend
 *    valida range por alvo, mas não limite superior de contagem.
 *  - **Multi-target não-AoE** (lista curada): magias que atingem N alvos
 *    sem área — `Magic Missile`, `Eldritch Blast`, `Scorching Ray`. O limite
 *    depende de slot/nível do caster.
 *  - **Single-target**: o padrão. Mais de 1 alvo → `SPELL_NOT_AOE`.
 */

/**
 * Normaliza variantes de slug (`acid-splash-phb`, `acid-splash-xphb` → `acid-splash`)
 * para que o catálogo funcione com qualquer fonte do SRD.
 */
function normalizeSpellSlug(slug: string): string {
  return slug.replace(/-(phb|xphb|tce|xge|fttod)$/, '');
}

const MULTI_TARGET_CATALOG: Record<
  string,
  (slotLevel: number, casterLevel: number) => number
> = {
  /** 3 dardos no slot 1; +1 por upcast. Máximo prático 10. */
  'magic-missile': (slotLevel: number) => Math.min(3 + Math.max(0, slotLevel - 1), 10),
  /** 1 beam a partir do nível 1; +1 a cada múltiplo de 5 (5, 11, 17). */
  'eldritch-blast': (_slot: number, casterLevel: number) =>
    casterLevel >= 17 ? 4 : casterLevel >= 11 ? 3 : casterLevel >= 5 ? 2 : 1,
  /** 3 raios no slot 2; +1 por upcast. */
  'scorching-ray': (slotLevel: number) => 3 + Math.max(0, slotLevel - 2),
  /**
   * Acid Splash (cantrip RAW): "Choose one creature within range, or choose two creatures
   * within range that are within 5 feet of each other". Até 2 alvos. Não é AoE com shape.
   */
  'acid-splash': () => 2,
};

/** Proxy tolerante a sufixos (`-phb`, `-xphb`, etc.) — retorna a mesma função do canônico. */
export const MULTI_TARGET_NON_AOE_SPELLS: Record<
  string,
  (slotLevel: number, casterLevel: number) => number
> = new Proxy(MULTI_TARGET_CATALOG, {
  has(target, prop: string) {
    return normalizeSpellSlug(prop) in target;
  },
  get(target, prop: string) {
    const normalized = normalizeSpellSlug(prop);
    return target[normalized];
  },
}) as typeof MULTI_TARGET_CATALOG;

/**
 * Verdadeiro AoE tem forma geométrica (cone, sphere, cube, line, cylinder) com tamanho.
 *
 * ⚠️  O DB contém `area_of_effect` em 2 formatos:
 *   - SRD 2014: `{ type: 'cone', size: 15 }` — forma real.
 *   - XPHB 2024: `{ tags: ['multiple targets'] }` — apenas metadados de targeting,
 *     NÃO é shape. Spells assim (Acid Splash, Fire Bolt) entram na lista curada
 *     `MULTI_TARGET_NON_AOE_SPELLS` ou seguem default single-target.
 *
 * Só consideramos AoE "real" quando há `type` e `size` numérico.
 */
export function isAoeSpell(spell: Pick<SpellEntity, 'area_of_effect'>): boolean {
  const aoe = spell.area_of_effect as { type?: unknown; size?: unknown } | null | undefined;
  return (
    aoe != null &&
    typeof aoe.type === 'string' &&
    typeof aoe.size === 'number'
  );
}

export function isMultiTargetNonAoeSpell(spell: Pick<SpellEntity, 'slug'>): boolean {
  return spell.slug in MULTI_TARGET_NON_AOE_SPELLS;
}

/**
 * Retorna o número máximo de alvos que a magia aceita no cast.
 * `Infinity` para magias de área (a forma é a restrição; backend valida range).
 */
export function maxTargetsFor(
  spell: Pick<SpellEntity, 'slug' | 'area_of_effect'>,
  slotLevel: number,
  casterLevel: number,
): number {
  if (isAoeSpell(spell)) return Number.POSITIVE_INFINITY;
  if (isMultiTargetNonAoeSpell(spell)) {
    return MULTI_TARGET_NON_AOE_SPELLS[spell.slug](slotLevel, casterLevel);
  }
  return 1;
}
