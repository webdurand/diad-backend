import type {
  ActionCost,
  TargetShape,
} from '../../interfaces/combat-action.interfaces';

/**
 * Spec 003 — catálogo estático de class features ativáveis cobertas na spec
 * (6 FULL + 10 STUB + 4 B-lite).
 *
 * Este catálogo descreve o shape declarativo de cada feature:
 * pré-requisitos (classe, level), custo (action economy + feature uses),
 * resolução (FULL vs STUB) e fórmula de max uses.
 *
 * `ClassFeatureActionResolver` consulta esse catálogo + o estado atual
 * (classes do PC, feature_uses_used, action economy) para gerar `ActionDescriptor[]`.
 *
 * `ClassFeatureExecutorService` consulta o mesmo catálogo + o body recebido
 * para validar pré-requisitos, decrementar usos e despachar (ou emitir evento).
 */

export type FeatureResolution = 'full' | 'stub' | 'wrapper';

export interface FeatureSpec {
  slug: string;
  displayName: string;
  /** Slug da classe requerida. Matching normaliza sufixos (`fighter-phb` === `fighter`). */
  classSlug: string;
  /** Sub-source (ex: 'XPHB'). Se omitido, aceita qualquer edition. */
  sourceEdition?: 'XPHB' | 'PHB';
  requiredLevel: number;
  actionCost: ActionCost;
  targetShape: TargetShape;
  targetRange?: number;
  resolution: FeatureResolution;
  /** Fórmula de max uses a partir do classLevel (ausente = ∞). */
  maxUsesByLevel?: (classLevel: number) => number;
  rechargeOn?: 'short' | 'long';
}

function normalizeClassSlug(slug: string): string {
  return slug.replace(/-phb$|-xphb$/, '');
}

export function matchesClass(
  spec: FeatureSpec,
  classes: Array<{ slug: string; level: number }>,
  sourceEditionBySlug?: Record<string, 'XPHB' | 'PHB' | undefined>,
): { matches: boolean; classLevel: number } {
  for (const c of classes) {
    const normalized = normalizeClassSlug(c.slug);
    if (normalized !== spec.classSlug) continue;
    if (spec.sourceEdition) {
      const edition = sourceEditionBySlug?.[c.slug];
      if (edition && edition !== spec.sourceEdition) continue;
    }
    return { matches: true, classLevel: c.level };
  }
  return { matches: false, classLevel: 0 };
}

export const CLASS_FEATURE_CATALOG: FeatureSpec[] = [
  // ---- Fighter ----
  {
    slug: 'second-wind',
    displayName: 'Segundo Fôlego',
    classSlug: 'fighter',
    requiredLevel: 1,
    actionCost: 'bonus',
    targetShape: 'self',
    resolution: 'full',
    maxUsesByLevel: (lv) => (lv >= 10 ? 3 : lv >= 4 ? 2 : 1),
    rechargeOn: 'short',
  },
  {
    slug: 'action-surge',
    displayName: 'Surto de Ação',
    classSlug: 'fighter',
    requiredLevel: 2,
    actionCost: 'free',
    targetShape: 'self',
    resolution: 'full',
    maxUsesByLevel: (lv) => (lv >= 17 ? 2 : 1),
    rechargeOn: 'short',
  },
  {
    /**
     * Fighter L9 Indomitable (RAW 2024 XPHB) — resolução FULL:
     * consome use + arma flag `indomitable_armed` no participant. Próximo
     * save failed do PC é automaticamente rerolled com +fighter_level de
     * bônus (saving-throw.service intercepta via IndomitableService).
     */
    slug: 'indomitable',
    displayName: 'Indomável',
    classSlug: 'fighter',
    requiredLevel: 9,
    actionCost: 'free',
    targetShape: 'self',
    resolution: 'full',
    maxUsesByLevel: (lv) => (lv >= 17 ? 3 : lv >= 13 ? 2 : 1),
    rechargeOn: 'short',
  },
  // ---- Barbarian ----
  {
    slug: 'rage',
    displayName: 'Fúria',
    classSlug: 'barbarian',
    requiredLevel: 1,
    actionCost: 'bonus',
    targetShape: 'self',
    resolution: 'stub',
    maxUsesByLevel: (lv) =>
      lv >= 20
        ? Number.POSITIVE_INFINITY
        : lv >= 17
          ? 6
          : lv >= 12
            ? 5
            : lv >= 6
              ? 4
              : lv >= 3
                ? 3
                : 2,
    rechargeOn: 'long',
  },
  {
    slug: 'reckless-attack',
    displayName: 'Ataque Imprudente',
    classSlug: 'barbarian',
    requiredLevel: 2,
    actionCost: 'free',
    targetShape: 'self',
    resolution: 'full',
  },
  // ---- Paladin ----
  {
    slug: 'lay-on-hands',
    displayName: 'Imposição de Mãos',
    classSlug: 'paladin',
    requiredLevel: 1,
    actionCost: 'action',
    targetShape: 'single-creature',
    targetRange: 5,
    resolution: 'full',
    maxUsesByLevel: (lv) => lv * 5, // pool de HP (gasto HP, nao usos)
    rechargeOn: 'long',
  },
  {
    slug: 'divine-sense',
    displayName: 'Sentido Divino',
    classSlug: 'paladin',
    requiredLevel: 1,
    actionCost: 'action',
    targetShape: 'self',
    resolution: 'stub',
    maxUsesByLevel: () => 1, // fallback; o executor pode somar CHA mod quando sheet disponivel
    rechargeOn: 'long',
  },
  // ---- Cleric ----
  {
    slug: 'channel-divinity',
    displayName: 'Canalizar Divindade',
    classSlug: 'cleric',
    requiredLevel: 2,
    actionCost: 'action',
    targetShape: 'single-creature',
    targetRange: 30,
    resolution: 'stub',
    maxUsesByLevel: (lv) => (lv >= 18 ? 3 : lv >= 6 ? 2 : 1),
    rechargeOn: 'short',
  },
  {
    // Expiração separada pra aparecer listável sem passar por wrapper de Channel.
    slug: 'turn-undead',
    displayName: 'Expulsar Mortos-Vivos',
    classSlug: 'cleric',
    requiredLevel: 2,
    actionCost: 'action',
    targetShape: 'multiple-creatures',
    targetRange: 30,
    resolution: 'stub',
    maxUsesByLevel: (lv) => (lv >= 18 ? 3 : lv >= 6 ? 2 : 1),
    rechargeOn: 'short',
  },
  // ---- Wizard ----
  {
    // Spec 011 Phase 3 — 1/dia, recupera slots após short rest.
    // Resolução STUB por ora: Spec 4 pode elevar a FULL conectando ao state.spell_slots_used.
    slug: 'arcane-recovery',
    displayName: 'Recuperação Arcana',
    classSlug: 'wizard',
    requiredLevel: 1,
    actionCost: 'free',
    targetShape: 'self',
    resolution: 'stub',
    maxUsesByLevel: () => 1,
    rechargeOn: 'long',
  },
  // ---- Druid ----
  {
    slug: 'wild-shape',
    displayName: 'Forma Selvagem',
    classSlug: 'druid',
    requiredLevel: 2,
    actionCost: 'bonus',
    targetShape: 'self',
    resolution: 'stub',
    maxUsesByLevel: () => 2,
    rechargeOn: 'short',
  },
  // ---- Bard ----
  {
    slug: 'bardic-inspiration',
    displayName: 'Inspiração Bárdica',
    classSlug: 'bard',
    requiredLevel: 1,
    actionCost: 'bonus',
    targetShape: 'single-creature',
    targetRange: 60,
    resolution: 'stub',
    // Max uses = CHA modifier (min 1) — executor substitui com sheet.
    maxUsesByLevel: () => 1,
    rechargeOn: 'long',
  },
  // ---- Rogue ----
  {
    slug: 'cunning-action',
    displayName: 'Ação Ardilosa',
    classSlug: 'rogue',
    requiredLevel: 2,
    actionCost: 'bonus',
    targetShape: 'self',
    resolution: 'wrapper',
  },
  {
    slug: 'steady-aim',
    displayName: 'Mira Firme',
    classSlug: 'rogue',
    sourceEdition: 'XPHB',
    requiredLevel: 1,
    actionCost: 'bonus',
    targetShape: 'self',
    resolution: 'stub',
  },
  {
    slug: 'cunning-strike',
    displayName: 'Golpe Ardiloso',
    classSlug: 'rogue',
    sourceEdition: 'XPHB',
    requiredLevel: 5,
    actionCost: 'free',
    targetShape: 'single-creature',
    resolution: 'stub',
  },
  {
    slug: 'uncanny-dodge',
    displayName: 'Esquiva Sobrenatural',
    classSlug: 'rogue',
    requiredLevel: 5,
    actionCost: 'reaction',
    targetShape: 'self',
    resolution: 'stub',
  },
  // ---- Monk ----
  {
    slug: 'flurry-of-blows',
    displayName: 'Rajada de Golpes',
    classSlug: 'monk',
    requiredLevel: 2,
    actionCost: 'bonus',
    targetShape: 'multiple-creatures',
    targetRange: 5,
    resolution: 'stub',
  },
  // ---- Sorcerer ----
  {
    slug: 'metamagic',
    displayName: 'Metamagia',
    classSlug: 'sorcerer',
    requiredLevel: 3,
    actionCost: 'free',
    targetShape: 'none',
    resolution: 'stub',
  },
  // ---- Warlock ----
  {
    slug: 'pact-of-the-blade-summon',
    displayName: 'Invocar Lâmina do Pacto',
    classSlug: 'warlock',
    requiredLevel: 3,
    actionCost: 'bonus',
    targetShape: 'self',
    resolution: 'stub',
  },
  {
    slug: 'dark-ones-blessing',
    displayName: "Bênção Fiendish (Dark One's Blessing)",
    classSlug: 'warlock',
    requiredLevel: 1, // Fiend L1 pre-2024; aceita em qualquer level desde que subclass='fiend'
    actionCost: 'free',
    targetShape: 'self',
    resolution: 'stub',
  },
  {
    slug: 'dark-ones-own-luck',
    displayName: "Sorte Fiendish (Dark One's Own Luck)",
    classSlug: 'warlock',
    requiredLevel: 6,
    actionCost: 'reaction',
    targetShape: 'self',
    resolution: 'stub',
    maxUsesByLevel: () => 1,
    rechargeOn: 'short',
  },
];
