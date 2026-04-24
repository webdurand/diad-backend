/**
 * Spec 015 — Eixo 4 (Polymorph/Wild Shape).
 *
 * Helpers puros que derivam de um MonsterEntity os descriptors Princípio X
 * usados no picker de Wild Shape/Polymorph:
 *   - tacticalSummary (camada 2, ≤140 chars): números que importam pro jogador
 *   - narrativeDescriptor (camada 3, ≤120 chars): flavor curto pra token/log
 *
 * Design: fallbacks heurísticos porque só 18/87 beasts do SRD têm `description`
 * populada. Determinístico por slug — sem aleatoriedade.
 */
import type { MonsterEntity } from 'src/entities/monster.entity';

const TACTICAL_MAX = 140;
const NARRATIVE_MAX = 120;

type SpeedLike = Record<string, unknown>;
type AcLike = unknown;

export interface BeastSummary {
  slug: string;
  name: string;
  cr: number;
  size: string;
  hitPoints: number;
  armorClass: number;
  speed: {
    walk?: number;
    fly?: number;
    swim?: number;
    burrow?: number;
    climb?: number;
  };
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  tacticalSummary: string;
  narrativeDescriptor: string;
}

export function parseSpeedValue(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const match = v.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
  }
  return undefined;
}

export function extractAc(ac: AcLike): number {
  if (typeof ac === 'number') return ac;
  if (Array.isArray(ac) && ac.length > 0) {
    const first = ac[0] as { value?: number };
    if (typeof first?.value === 'number') return first.value;
  }
  if (typeof ac === 'object' && ac !== null) {
    const v = (ac as { value?: number }).value;
    if (typeof v === 'number') return v;
  }
  return 10;
}

export function extractSpeed(speed: SpeedLike | null | undefined): BeastSummary['speed'] {
  const s = (speed ?? {}) as Record<string, unknown>;
  const out: BeastSummary['speed'] = {};
  const walk = parseSpeedValue(s.walk);
  const fly = parseSpeedValue(s.fly);
  const swim = parseSpeedValue(s.swim);
  const burrow = parseSpeedValue(s.burrow);
  const climb = parseSpeedValue(s.climb);
  if (walk != null) out.walk = walk;
  if (fly != null) out.fly = fly;
  if (swim != null) out.swim = swim;
  if (burrow != null) out.burrow = burrow;
  if (climb != null) out.climb = climb;
  return out;
}

export function formatCr(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  if (Number.isInteger(cr)) return String(cr);
  return String(cr);
}

function hasMultiattack(actions: unknown): boolean {
  if (!Array.isArray(actions)) return false;
  return actions.some((a) => {
    const name = (a as { name?: unknown })?.name;
    return typeof name === 'string' && /multiattack/i.test(name);
  });
}

function attackNames(actions: unknown, limit = 2): string[] {
  if (!Array.isArray(actions)) return [];
  return actions
    .map((a) => (a as { name?: unknown })?.name)
    .filter((n): n is string => typeof n === 'string' && !/multiattack/i.test(n))
    .slice(0, limit);
}

function speedSummary(speed: BeastSummary['speed']): string {
  const parts: string[] = [];
  if (speed.walk != null) parts.push(`walk ${speed.walk}`);
  if (speed.fly != null) parts.push(`fly ${speed.fly}`);
  if (speed.swim != null) parts.push(`swim ${speed.swim}`);
  if (speed.burrow != null) parts.push(`burrow ${speed.burrow}`);
  if (speed.climb != null) parts.push(`climb ${speed.climb}`);
  return parts.join(' / ');
}

/**
 * Truncate no último espaço antes do limite, preservando pontuação quando possível.
 */
export function truncateSoft(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[.,;:]+$/, '')}…`;
}

export function buildTacticalSummary(monster: MonsterEntity): string {
  const cr = formatCr(monster.challenge_rating);
  const ac = extractAc(monster.armor_class);
  const speed = extractSpeed(monster.speed);
  const speedStr = speedSummary(speed);
  const multi = hasMultiattack(monster.actions);
  const atks = attackNames(monster.actions, 2).map((a) => a.toLowerCase());
  const attackPart = atks.length
    ? multi
      ? `multiattack ${atks.join('+')}`
      : atks.join('+')
    : multi
    ? 'multiattack'
    : 'sem multiattack';

  const raw = `CR ${cr}, ${monster.hit_points} HP, AC ${ac}, ${speedStr}. ${attackPart}.`;
  return truncateSoft(raw, TACTICAL_MAX);
}

const SIZE_ADJECTIVES: Record<string, string> = {
  tiny: 'minúsculo',
  small: 'pequeno',
  medium: 'médio',
  large: 'grande',
  huge: 'enorme',
  gargantuan: 'colossal',
};

const NAME_FLAVOR: ReadonlyArray<[RegExp, string]> = [
  [/bear/i, 'musculoso com pelagem grossa e garras afiadas'],
  [/wolf/i, 'magro e ágil, com olhar fixo e presas prontas'],
  [/lion|tiger|panther|leopard|cat/i, 'felino ágil com garras retráteis e passos silenciosos'],
  [/eagle|hawk|falcon|owl/i, 'ave de rapina com visão aguda e voo rápido'],
  [/snake|serpent|viper/i, 'serpente ondulante com escamas lustrosas'],
  [/spider|scorpion/i, 'aracnídeo rastejante com múltiplas pernas e veneno'],
  [/ape|gorilla|baboon/i, 'primata musculoso com braços longos e mãos fortes'],
  [/horse|pony|mule|donkey|elk|deer|stag|moose/i, 'quadrúpede veloz de cascos firmes'],
  [/shark|eel/i, 'predador aquático esguio com dentes afiados'],
  [/octopus|squid/i, 'cefalópode com tentáculos flexíveis'],
  [/rat|mouse|weasel|ferret/i, 'pequeno roedor ágil e nervoso'],
  [/boar|pig/i, 'suíno robusto com presas salientes'],
  [/crocodile|alligator/i, 'réptil blindado de mandíbulas poderosas'],
];

export function buildNarrativeDescriptor(monster: MonsterEntity): string {
  const sizeAdj = SIZE_ADJECTIVES[(monster.size || '').toLowerCase()] ?? monster.size;
  const lowerName = monster.name.toLowerCase();
  const flavor = NAME_FLAVOR.find(([re]) => re.test(lowerName))?.[1]
    ?? 'fera com olhos atentos e músculos tensos';
  const raw = `${monster.name} ${sizeAdj}: ${flavor}.`;
  return truncateSoft(raw, NARRATIVE_MAX);
}

export function toBeastSummary(monster: MonsterEntity): BeastSummary {
  return {
    slug: monster.slug,
    name: monster.name,
    cr: monster.challenge_rating,
    size: (monster.size || 'medium').toLowerCase(),
    hitPoints: monster.hit_points,
    armorClass: extractAc(monster.armor_class),
    speed: extractSpeed(monster.speed),
    abilities: {
      str: monster.strength,
      dex: monster.dexterity,
      con: monster.constitution,
      int: monster.intelligence,
      wis: monster.wisdom,
      cha: monster.charisma,
    },
    tacticalSummary: buildTacticalSummary(monster),
    narrativeDescriptor: buildNarrativeDescriptor(monster),
  };
}

export interface BeastFilter {
  maxCr: number;
  excludeFly?: boolean;
  excludeSwim?: boolean;
  excludeBurrow?: boolean;
}

export function passesLocomotionFilter(
  monster: MonsterEntity,
  filter: Pick<BeastFilter, 'excludeFly' | 'excludeSwim' | 'excludeBurrow'>,
): boolean {
  const speed = extractSpeed(monster.speed);
  if (filter.excludeFly && speed.fly != null && speed.fly > 0) return false;
  if (filter.excludeSwim && speed.swim != null && speed.swim > 0) return false;
  if (filter.excludeBurrow && speed.burrow != null && speed.burrow > 0) return false;
  return true;
}

const VALID_CR_DENOMINATORS = new Set([1, 2, 4, 8]);

export function resolveMaxCr(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || numerator < 0) {
    throw new Error('INVALID_CR_FILTER');
  }
  if (!VALID_CR_DENOMINATORS.has(denominator)) {
    throw new Error('INVALID_CR_DENOMINATOR');
  }
  return numerator / denominator;
}
