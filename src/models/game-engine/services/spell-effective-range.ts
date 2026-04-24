import { parseRangeString } from './combat-range';

/**
 * Spec 015 Eixo 2 — desambigua o campo `spell.range` quando "Self" pode
 * significar 3 coisas diferentes:
 *
 *   1. **self-buff** — buff aplicado no caster (Mage Armor, Shield of Faith).
 *      Caster É o alvo legítimo.
 *   2. **self-aoe** — emanação de área a partir do caster (Burning Hands,
 *      Thunderwave, Cone of Cold). Caster está AT origin, não DENTRO da área.
 *   3. **self-origin-attack** — o efeito mágico nasce no caster mas o attack
 *      é ranged ou melee contra OUTRA criatura (Produce Flame 30ft ranged,
 *      Flame Blade 5ft melee). Caster NÃO pode ser o alvo (RAW: descrição
 *      sempre diz "at a creature").
 *
 * Pré-015: `parseRangeString("Self")` retornava `{normal: 0}` tratando os 3
 * casos como "target = caster na mesma cell". Consequência: Produce Flame
 * aceitava só o druida como alvo e auto-infligia 4d8 fire.
 *
 * Helper puro — sem IO, sem DI.
 */

/** Shape mínimo necessário (compatível com SpellEntity). */
export interface SpellShapeForRange {
  slug: string;
  range: string;
  attack_type?: 'ranged' | 'melee' | null;
  area_of_effect?: { type?: string; size?: number } | null;
}

export type SpellEffectiveRange =
  | {
      kind: 'self-buff';
      attackRangeFt: null;
      aoeShape: null;
      rejectSelfAsTarget: false;
    }
  | {
      kind: 'self-aoe';
      attackRangeFt: null;
      aoeShape: { type: string; size: number };
      rejectSelfAsTarget: false;
    }
  | {
      kind: 'self-origin-attack';
      attackRangeFt: number;
      attackType: 'ranged' | 'melee';
      rejectSelfAsTarget: true;
      aoeShape: null;
    }
  | {
      kind: 'normal';
      attackRangeFt: number;
      rejectSelfAsTarget: boolean;
      aoeShape: null;
    };

/**
 * Overrides manuais para spells cujo range do attack diverge da heurística
 * default (30ft ranged / 5ft melee). Curado com página PHB ao lado.
 *
 * Heurística default cobre a imensa maioria das cantrips/spells. Overrides
 * entram apenas em exceções documentadas (ex.: spell que tem "within 60 feet
 * of you" em vez de "within 30 feet").
 */
const SELF_ORIGIN_ATTACK_RANGE_OVERRIDES: Record<string, number> = {
  // Produce Flame (PHB 2014 p.269) — "hurl the flame at a creature within 30 feet"
  'produce-flame': 30,
  // Flame Blade (PHB 2014 p.241) — "you can make a melee spell attack"
  // melee implícito = 5ft reach
  'flame-blade': 5,
};

function normalizeSlug(slug: string): string {
  return slug.replace(/-(phb|xphb|tce|xge|fttod)$/, '');
}

/**
 * AoE "real" tem `type` (cone/sphere/cube/line/cylinder) e `size` numérico.
 * O DB contém XPHB variants com apenas `{tags: ['multiple targets']}` —
 * isso NÃO é shape, é metadata de targeting.
 */
function hasRealAoeShape(
  aoe: SpellShapeForRange['area_of_effect'],
): aoe is { type: string; size: number } {
  return (
    aoe != null &&
    typeof aoe === 'object' &&
    typeof (aoe as { type?: unknown }).type === 'string' &&
    typeof (aoe as { size?: unknown }).size === 'number'
  );
}

export function getSpellEffectiveRange(
  spell: SpellShapeForRange,
): SpellEffectiveRange {
  const rangeLower = (spell.range ?? '').trim().toLowerCase();
  const isSelfRange = rangeLower === 'self';
  const aoe = hasRealAoeShape(spell.area_of_effect)
    ? spell.area_of_effect
    : null;
  const attackType = spell.attack_type ?? null;

  if (isSelfRange && aoe) {
    return {
      kind: 'self-aoe',
      attackRangeFt: null,
      aoeShape: aoe,
      rejectSelfAsTarget: false,
    };
  }

  if (isSelfRange && attackType) {
    const normalized = normalizeSlug(spell.slug);
    const overrideFt = SELF_ORIGIN_ATTACK_RANGE_OVERRIDES[normalized];
    const defaultFt = attackType === 'melee' ? 5 : 30;
    return {
      kind: 'self-origin-attack',
      attackRangeFt: overrideFt ?? defaultFt,
      attackType,
      rejectSelfAsTarget: true,
      aoeShape: null,
    };
  }

  if (isSelfRange) {
    return {
      kind: 'self-buff',
      attackRangeFt: null,
      aoeShape: null,
      rejectSelfAsTarget: false,
    };
  }

  const parsed = parseRangeString(spell.range);
  return {
    kind: 'normal',
    attackRangeFt: parsed?.normal ?? 0,
    rejectSelfAsTarget: false,
    aoeShape: null,
  };
}
