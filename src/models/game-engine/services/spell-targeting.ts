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
  /** Bless (1st lvl): "up to three creatures of your choice". Spec 4. */
  'bless': () => 3,
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
export function isAoeSpell(
  spell: Pick<SpellEntity, 'slug' | 'area_of_effect'>,
): boolean {
  return getAoeShape(spell) !== null;
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

/**
 * Spec 012 Gap 2 — damage por dart/beam/ray para magias multi-target não-AoE.
 * Ao contrário de AoE (dado rolado uma vez, aplicado com save a cada alvo),
 * aqui cada entry de `targetParticipantIds` corresponde a UM dart/beam/ray
 * e precisa do seu próprio roll.
 *
 * RAW D&D 2024:
 * - Magic Missile: cada dart = 1d4+1 force
 * - Scorching Ray: cada ray = 2d6 fire (attack roll por ray)
 * - Eldritch Blast: cada beam = 1d10 force (attack roll por beam)
 * - Acid Splash: cada alvo rola cantrip scaling igual (1d6 L1, 2d6 L5, etc.)
 */
export interface PerHitDamage {
  expression: string;
  type: string;
}

export function getPerHitDamage(
  slug: string,
  slotLevel: number,
  casterLevel: number,
): PerHitDamage | null {
  const normalized = slug.replace(/-(phb|xphb|tce|xge|fttod)$/, '');
  switch (normalized) {
    case 'magic-missile':
      return { expression: '1d4+1', type: 'force' };
    case 'scorching-ray':
      return { expression: '2d6', type: 'fire' };
    case 'eldritch-blast': {
      return { expression: '1d10', type: 'force' };
    }
    case 'acid-splash': {
      const tier = casterLevel >= 17 ? 4 : casterLevel >= 11 ? 3 : casterLevel >= 5 ? 2 : 1;
      return { expression: `${tier}d6`, type: 'acid' };
    }
    default:
      return null;
  }
}

/**
 * Spec 012 Gap 1 — AoE shape extraction.
 * Retorna shape kind + raio em cells (5ft/cell). Retorna null se não é AoE real.
 */
export type AoeShapeKind = 'sphere' | 'cube' | 'cone' | 'line' | 'cylinder';

export interface AoeShape {
  kind: AoeShapeKind;
  /** Raio/size em cells (já dividido por 5ft). */
  radiusCells: number;
  /** Size original em pés (pra logs/UI). */
  sizeFt: number;
}

/**
 * Fallback canonical AoE sizes — DB em XPHB 2024 guarda só `tags` (sem size/type).
 * Valores RAW PHB/XPHB pra spells comumente usadas. Quando o DB só tem tags,
 * consultamos essa tabela pela slug normalizada.
 */
const CANONICAL_AOE: Record<string, { kind: AoeShapeKind; sizeFt: number }> = {
  // Sphere
  fireball: { kind: 'sphere', sizeFt: 20 },
  'delayed-blast-fireball': { kind: 'sphere', sizeFt: 20 },
  shatter: { kind: 'sphere', sizeFt: 10 },
  'vitriolic-sphere': { kind: 'sphere', sizeFt: 20 },
  'watery-sphere': { kind: 'sphere', sizeFt: 5 },
  weird: { kind: 'sphere', sizeFt: 30 },
  'zone-of-truth': { kind: 'sphere', sizeFt: 15 },
  'spirit-guardians': { kind: 'sphere', sizeFt: 15 },
  'spike-growth': { kind: 'sphere', sizeFt: 20 },
  cloudkill: { kind: 'sphere', sizeFt: 20 },
  'hunger-of-hadar': { kind: 'sphere', sizeFt: 20 },
  'destructive-wave': { kind: 'sphere', sizeFt: 30 },
  'earthquake': { kind: 'sphere', sizeFt: 100 },
  // Cube
  thunderwave: { kind: 'cube', sizeFt: 15 },
  'black-tentacles': { kind: 'cube', sizeFt: 20 },
  web: { kind: 'cube', sizeFt: 20 },
  // Cone
  'burning-hands': { kind: 'cone', sizeFt: 15 },
  'cone-of-cold': { kind: 'cone', sizeFt: 60 },
  'color-spray': { kind: 'cone', sizeFt: 15 },
  'ice-knife': { kind: 'sphere', sizeFt: 5 },
  'dragons-breath': { kind: 'cone', sizeFt: 15 },
  // Line
  'lightning-bolt': { kind: 'line', sizeFt: 100 },
  'wall-of-fire': { kind: 'line', sizeFt: 60 },
};

export function getAoeShape(
  spell: Pick<SpellEntity, 'slug' | 'area_of_effect'>,
): AoeShape | null {
  const aoe = spell.area_of_effect as
    | { type?: string; size?: number; tags?: string[] }
    | null
    | undefined;

  if (aoe && typeof aoe.type === 'string' && typeof aoe.size === 'number') {
    const kindRaw = aoe.type.toLowerCase();
    if (
      kindRaw === 'sphere' ||
      kindRaw === 'cube' ||
      kindRaw === 'cone' ||
      kindRaw === 'line' ||
      kindRaw === 'cylinder'
    ) {
      return {
        kind: kindRaw,
        radiusCells: Math.max(1, Math.ceil(aoe.size / 5)),
        sizeFt: aoe.size,
      };
    }
  }

  // Fallback: consulta tabela canonical por slug quando DB só tem tags.
  const normalized = normalizeSpellSlug((spell as any).slug ?? '');
  const canonical = CANONICAL_AOE[normalized];
  if (canonical) {
    return {
      kind: canonical.kind,
      radiusCells: Math.max(1, Math.ceil(canonical.sizeFt / 5)),
      sizeFt: canonical.sizeFt,
    };
  }

  return null;
}

/**
 * Spec 012 Gap 1 — checa se (x,y) está dentro da área AoE centrada em origin.
 * Mesma lógica de `persistent-area.service.cellInArea` — abstraída aqui pra
 * permitir resolução de AoE em /cast-spell (sem persistir area-effect).
 */
export function cellInAoe(
  cell: { x: number; y: number },
  origin: { x: number; y: number },
  shape: AoeShape,
): boolean {
  const dx = cell.x - origin.x;
  const dy = cell.y - origin.y;
  if (shape.kind === 'sphere' || shape.kind === 'cylinder') {
    return Math.sqrt(dx * dx + dy * dy) <= shape.radiusCells;
  }
  if (shape.kind === 'cube') {
    return (
      Math.abs(dx) <= shape.radiusCells && Math.abs(dy) <= shape.radiusCells
    );
  }
  // Line/cone: simplificação — bounding box Chebyshev (refine em spec dedicada).
  return Math.max(Math.abs(dx), Math.abs(dy)) <= shape.radiusCells;
}
