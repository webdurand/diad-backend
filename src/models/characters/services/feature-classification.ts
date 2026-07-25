

export interface FeatureClassification {

  kind: "hide" | "alias";

  canonicalSlug?: string;
}


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


const DRUID_PASSIVES: readonly string[] = [
  "archdruid",
  "druid-timeless-body",
  "wild-shape-improvements",
  "druidic",
  "druidic-druid-1",
  "druid-circle",
  "druid-subclass-druid-3",
  "nature-s-sanctuary",
  "nature-s-ward",
];


const ALIASES: Record<string, string> = {
  "countercharm-bard-7": "countercharm",
};

const HIDE_SET: ReadonlySet<string> = new Set([
  ...BARD_PASSIVES,
  ...DRUID_PASSIVES,
]);


const HIDE_PATTERNS: readonly RegExp[] = [

  /^wild-shape-cr-.+$/,

  /^ability-score-improvement-[a-z-]+-\d+$/,
  /^[a-z-]+-ability-score-improvement-\d+$/,

  /^epic-boon-[a-z-]+-\d+$/,

  /^subclass-feature-[a-z-]+-\d+$/,

  /^[a-z-]+-(college|circle|school|domain)-improvement-\d+$/,

  /^spellcasting-[a-z-]+-\d+$/,
  /^pact-magic-[a-z-]+-\d+$/,

  /^primal-order-[a-z-]+-\d+$/,
  /^elemental-fury-druid-\d+$/,
  /^primal-strike-druid-\d+$/,
  /^potent-spellcasting-druid-\d+$/,
  /^improved-elemental-fury-druid-\d+$/,
  /^lunar-form-druid-moon-\d+$/,
];


const ALIAS_PATTERNS: Array<{ regex: RegExp; canonicalSlug: string }> = [

  {
    regex: /^bardic-inspiration-(d\d+|bard-\d+)$/,
    canonicalSlug: "bardic-inspiration",
  },



  { regex: /^wild-shape-druid-\d+$/, canonicalSlug: "wild-shape" },
  {
    regex: /^wild-companion-druid-\d+$/,
    canonicalSlug: "wild-companion",
  },
  {
    regex: /^wild-resurgence-druid-\d+$/,
    canonicalSlug: "wild-resurgence",
  },
  {
    regex: /^moonlight-step-druid(?:-moon)?-\d+$/,
    canonicalSlug: "moonlight-step",
  },
  { regex: /^rage-barbarian-\d+$/, canonicalSlug: "rage" },
  {
    regex: /^reckless-attack-barbarian-\d+$/,
    canonicalSlug: "reckless-attack",
  },
  { regex: /^action-surge-fighter-\d+$/, canonicalSlug: "action-surge" },
  { regex: /^second-wind-fighter-\d+$/, canonicalSlug: "second-wind" },
  { regex: /^sneak-attack-rogue-\d+$/, canonicalSlug: "sneak-attack" },
  { regex: /^cunning-action-rogue-\d+$/, canonicalSlug: "cunning-action" },
  { regex: /^steady-aim-rogue-\d+$/, canonicalSlug: "steady-aim" },
  { regex: /^martial-arts-monk-\d+$/, canonicalSlug: "martial-arts" },
  { regex: /^flurry-of-blows-monk-\d+$/, canonicalSlug: "flurry-of-blows" },
  { regex: /^patient-defense-monk-\d+$/, canonicalSlug: "patient-defense" },
  { regex: /^step-of-the-wind-monk-\d+$/, canonicalSlug: "step-of-the-wind" },
  { regex: /^stunning-strike-monk-\d+$/, canonicalSlug: "stunning-strike" },
  {
    regex: /^channel-divinity-(cleric|paladin)-\d+$/,
    canonicalSlug: "channel-divinity",
  },
  { regex: /^divine-smite-paladin-\d+$/, canonicalSlug: "divine-smite" },
  { regex: /^divine-sense-paladin-\d+$/, canonicalSlug: "divine-sense" },
  { regex: /^lay-on-hands-paladin-\d+$/, canonicalSlug: "lay-on-hands" },
  { regex: /^faithful-steed-paladin-\d+$/, canonicalSlug: "faithful-steed" },
  { regex: /^abjure-foes-paladin-\d+$/, canonicalSlug: "abjure-foes" },
  {
    regex: /^(?:channel-divinity-)?sacred-weapon(?:-paladin)?(?:-devotion)?-\d+$/,
    canonicalSlug: "sacred-weapon",
  },
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
