/**
 * Spec 015 Eixo 1 — classificação de features do SRD para a aba de Ações.
 *
 * ## Motivação
 *
 * O fallback em `actions.service.buildFeatureActions` usa regex heurística
 * (`/action|bonus action|reaction|use|activate|expend/i`) no texto da
 * descrição para decidir se uma feature deve virar "action" na UI. Isso
 * resulta em dois problemas reais:
 *
 *   1. **Passivas vazam como action**: "Song of Rest" (só afeta short rest),
 *      "Expertise" (grant em skills), "Jack of All Trades" (passivo universal),
 *      "Archdruid" (capstone de uso infinito de Wild Shape), etc., todos
 *      matcham o regex e viram cards falsos na aba Ações.
 *
 *   2. **Scalings duplicam cards**: `bardic-inspiration-d8`, `-d10`, `-d12`
 *      são a MESMA feature com dado escalando pelo nível. Hoje viram 3 cards
 *      idênticos na aba Bonus Action.
 *
 * ## Solução
 *
 * Tabela curada (slug → classification) consultada ANTES do regex fallback
 * em `buildFeatureActions`:
 *
 *   - `hide`    → feature passiva; não emite como action. Vai pra aba
 *                 Traits/Features via outro canal (FeatureBlock no sheet).
 *   - `alias`   → scaling variant; redireciona pro canonical. Quando o
 *                 canonical está no `featureActionMap` (ex: `bardic-inspiration`),
 *                 ele é emitido UMA vez com stats corretos do nível atual.
 *
 * Features que NÃO estão no catálogo (retorno `null`) continuam seguindo
 * o fluxo antigo — compatibilidade backward preservada.
 *
 * ## Fonte
 *
 * Cada entry é curada com PHB 2014 ao lado (Princípio II — RAW zero invenção).
 * Scalings referenciam a feature pai por `canonicalSlug`.
 */

export interface FeatureClassification {
  /**
   * - `hide`: passiva — não emite como action.
   * - `alias`: scaling/variant — o canonical cuida da emissão.
   */
  kind: "hide" | "alias";
  /** Só preenchido quando `kind === 'alias'`. */
  canonicalSlug?: string;
}

/** Features passivas do Bardo (PHB 2014 + XPHB 2024 variants). */
const BARD_PASSIVES: readonly string[] = [
  "song-of-rest-d6",
  "song-of-rest-d8",
  "song-of-rest-d10",
  "song-of-rest-d12",
  "jack-of-all-trades",
  "jack-of-all-trades-bard-2",
  "bard-expertise-1",
  "bard-expertise-2",
  "expertise-bard-2",
  "expertise-bard-9",
  "font-of-inspiration",
  "font-of-inspiration-bard-5",
  "superior-inspiration",
  "superior-inspiration-bard-18",
  "magical-secrets-1",
  "magical-secrets-2",
  "magical-secrets-3",
  "magical-secrets-bard-10",
  "additional-magical-secrets",
  "peerless-skill",
  "words-of-creation-bard-20",
  "bonus-proficiencies",
  "bard-college",
  "bard-subclass-bard-3",
];

/** Features passivas do Druida. */
const DRUID_PASSIVES: readonly string[] = [
  "archdruid", // L20 capstone — unlimited Wild Shape
  "druid-timeless-body", // L18
  "wild-shape-improvements",
  "druidic",
  "druidic-druid-1",
  "druid-circle",
  "druid-subclass-druid-3",
  "nature-s-sanctuary",
  "nature-s-ward",
];

/**
 * Scaling aliases: mapeiam variants para o canonical. O canonical (ex:
 * `bardic-inspiration`) vive no `featureActionMap` de `actions.service` e
 * cuida de emitir UMA entry com stats do nível atual.
 */
const ALIASES: Record<string, string> = {
  "countercharm-bard-7": "countercharm",
};

const HIDE_SET: ReadonlySet<string> = new Set([
  ...BARD_PASSIVES,
  ...DRUID_PASSIVES,
]);

/**
 * Regex patterns que classificam features por padrão — cobre scaling variants
 * automaticamente sem precisar listar cada slug. Útil porque o SRD tem muitas
 * features com sufixos numéricos (`-1`, `-2`, `-druid-4`, `-d8`).
 */
const HIDE_PATTERNS: readonly RegExp[] = [
  // Wild Shape CR scaling markers (Druida L2/L4/L8 unlocks — passive, informational)
  /^wild-shape-cr-.+$/,
  // Ability Score Improvement — SEMPRE passive (grant atributo/feat)
  /^ability-score-improvement-[a-z-]+-\d+$/,
  /^[a-z-]+-ability-score-improvement-\d+$/,
  // Epic Boon (L19 feat grant)
  /^epic-boon-[a-z-]+-\d+$/,
  // Subclass feature markers (ex: subclass-feature-bard-6, subclass-feature-cleric-14)
  /^subclass-feature-[a-z-]+-\d+$/,
  // Class improvement markers (Bard College, Druid Circle, Wizard School, Cleric Domain)
  /^[a-z-]+-(college|circle|school|domain)-improvement-\d+$/,
  // Spellcasting/Pact Magic grants (passives — modelam caster type, não ação)
  /^spellcasting-[a-z-]+-\d+$/,
  /^pact-magic-[a-z-]+-\d+$/,
  // Primal Order (druid L1) — passive grant
  /^primal-order-[a-z-]+-\d+$/,
];

/**
 * Aliases por padrão — scalings com sufixo numérico viram o canonical.
 * Usado quando o scaling varia por nível (BI d6→d8→d10→d12 p.ex.).
 */
const ALIAS_PATTERNS: Array<{ regex: RegExp; canonicalSlug: string }> = [
  // Bardic Inspiration: d6/d8/d10/d12 + variant -bard-1 (XPHB seed)
  {
    regex: /^bardic-inspiration-(d\d+|bard-\d+)$/,
    canonicalSlug: "bardic-inspiration",
  },
  // Spec 015 Eixo 1 — XPHB 2024 adiciona sufixo `<feature>-<classe>-<level>`
  // ao slug. Sem estes aliases o matching em featureActionMap falha e a
  // feature não aparece na ActionBar (reportado 2026-04-24 sobre Wild Shape).
  { regex: /^wild-shape-druid-\d+$/, canonicalSlug: "wild-shape" },
  { regex: /^rage-barbarian-\d+$/, canonicalSlug: "rage" },
  {
    regex: /^reckless-attack-barbarian-\d+$/,
    canonicalSlug: "reckless-attack",
  },
  { regex: /^action-surge-fighter-\d+$/, canonicalSlug: "action-surge" },
  { regex: /^second-wind-fighter-\d+$/, canonicalSlug: "second-wind" },
  { regex: /^sneak-attack-rogue-\d+$/, canonicalSlug: "sneak-attack" },
  { regex: /^cunning-action-rogue-\d+$/, canonicalSlug: "cunning-action" },
  { regex: /^martial-arts-monk-\d+$/, canonicalSlug: "martial-arts" },
  { regex: /^flurry-of-blows-monk-\d+$/, canonicalSlug: "flurry-of-blows" },
  { regex: /^patient-defense-monk-\d+$/, canonicalSlug: "patient-defense" },
  { regex: /^step-of-the-wind-monk-\d+$/, canonicalSlug: "step-of-the-wind" },
  {
    regex: /^channel-divinity-(cleric|paladin)-\d+$/,
    canonicalSlug: "channel-divinity",
  },
  { regex: /^divine-smite-paladin-\d+$/, canonicalSlug: "divine-smite" },
  { regex: /^lay-on-hands-paladin-\d+$/, canonicalSlug: "lay-on-hands" },
  { regex: /^font-of-magic-sorcerer-\d+$/, canonicalSlug: "font-of-magic" },
  { regex: /^arcane-recovery-wizard-\d+$/, canonicalSlug: "arcane-recovery" },
  {
    regex: /^eldritch-invocations?-warlock-\d+$/,
    canonicalSlug: "eldritch-invocations",
  },
  { regex: /^cutting-words-bard-\d+$/, canonicalSlug: "cutting-words" },
  { regex: /^countercharm-bard-\d+$/, canonicalSlug: "countercharm" },
  { regex: /^dreadful-strikes-ranger-\d+$/, canonicalSlug: "dreadful-strikes" },
];

/**
 * Retorna a classificação de uma feature para a aba Ações, ou `null` se a
 * feature não tem override (segue fluxo normal).
 */
export function classifyFeatureForActions(
  slug: string,
): FeatureClassification | null {
  if (HIDE_SET.has(slug)) {
    return { kind: "hide" };
  }
  for (const pattern of HIDE_PATTERNS) {
    if (pattern.test(slug)) return { kind: "hide" };
  }
  const directAlias = ALIASES[slug];
  if (directAlias) {
    return { kind: "alias", canonicalSlug: directAlias };
  }
  for (const { regex, canonicalSlug } of ALIAS_PATTERNS) {
    if (regex.test(slug)) return { kind: "alias", canonicalSlug };
  }
  return null;
}
