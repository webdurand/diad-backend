import type {
  ActionCost,
  TargetShape,
} from "../../interfaces/combat-action.interfaces";
import { getSecondWindMaxUses } from "src/shared/fighter-rules";
import { proficiencyBonusForLevel } from "src/shared/goliath-rules";



export type FeatureResolution = "full" | "stub" | "wrapper";

export interface FeatureSpec {
  slug: string;
  displayName: string;

  classSlug?: string;
  raceSlug?: string;
  requiredRaceTraitChoice?: string;
  trigger?: "action-bar" | "on-hit" | "on-damaged" | "internal";

  sourceEdition?: "XPHB" | "PHB";
  requiredLevel: number;
  actionCost: ActionCost;
  targetShape: TargetShape;
  targetRange?: number;
  resolution: FeatureResolution;

  maxUsesByLevel?: (classLevel: number) => number;
  rechargeOn?: "short" | "long";

  usesSharedWith?: string;
}

function normalizeClassSlug(slug: string): string {
  return slug.replace(/-phb$|-xphb$/, "");
}

export function matchesClass(
  spec: FeatureSpec,
  classes: Array<{ slug: string; level: number }>,
  sourceEditionBySlug?: Record<string, "XPHB" | "PHB" | undefined>,
  raceSlug?: string,
  totalLevel?: number,
): { matches: boolean; classLevel: number } {
  if (spec.raceSlug) {
    const normalizedRace = normalizeClassSlug(raceSlug ?? "");
    return {
      matches: normalizedRace === spec.raceSlug,
      classLevel:
        totalLevel ??
        classes.reduce((sum, characterClass) => sum + characterClass.level, 0),
    };
  }
  if (!spec.classSlug) {
    return { matches: false, classLevel: 0 };
  }
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

  {
    slug: "giant-ancestry",
    displayName: "Ancestralidade Gigante",
    raceSlug: "goliath",
    requiredLevel: 1,
    actionCost: "free",
    targetShape: "none",
    resolution: "wrapper",
    maxUsesByLevel: proficiencyBonusForLevel,
    rechargeOn: "long",
    trigger: "internal",
  },
  {
    slug: "clouds-jaunt",
    displayName: "Salto das Nuvens",
    raceSlug: "goliath",
    requiredRaceTraitChoice: "clouds-jaunt",
    requiredLevel: 1,
    actionCost: "bonus",
    targetShape: "self",
    targetRange: 30,
    resolution: "stub",
    usesSharedWith: "giant-ancestry",
    trigger: "action-bar",
  },
  {
    slug: "fires-burn",
    displayName: "Queimadura do Fogo",
    raceSlug: "goliath",
    requiredRaceTraitChoice: "fires-burn",
    requiredLevel: 1,
    actionCost: "free",
    targetShape: "single-creature",
    resolution: "stub",
    usesSharedWith: "giant-ancestry",
    trigger: "on-hit",
  },
  {
    slug: "frosts-chill",
    displayName: "Calafrio do Gelo",
    raceSlug: "goliath",
    requiredRaceTraitChoice: "frosts-chill",
    requiredLevel: 1,
    actionCost: "free",
    targetShape: "single-creature",
    resolution: "stub",
    usesSharedWith: "giant-ancestry",
    trigger: "on-hit",
  },
  {
    slug: "hills-tumble",
    displayName: "Queda da Colina",
    raceSlug: "goliath",
    requiredRaceTraitChoice: "hills-tumble",
    requiredLevel: 1,
    actionCost: "free",
    targetShape: "single-creature",
    resolution: "stub",
    usesSharedWith: "giant-ancestry",
    trigger: "on-hit",
  },
  {
    slug: "stones-endurance",
    displayName: "Resistência da Pedra",
    raceSlug: "goliath",
    requiredRaceTraitChoice: "stones-endurance",
    requiredLevel: 1,
    actionCost: "reaction",
    targetShape: "self",
    resolution: "stub",
    usesSharedWith: "giant-ancestry",
    trigger: "on-damaged",
  },
  {
    slug: "storms-thunder",
    displayName: "Trovão da Tempestade",
    raceSlug: "goliath",
    requiredRaceTraitChoice: "storms-thunder",
    requiredLevel: 1,
    actionCost: "reaction",
    targetShape: "single-creature",
    targetRange: 60,
    resolution: "stub",
    usesSharedWith: "giant-ancestry",
    trigger: "on-damaged",
  },
  {
    slug: "large-form",
    displayName: "Forma Grande",
    raceSlug: "goliath",
    requiredLevel: 5,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",
    maxUsesByLevel: () => 1,
    rechargeOn: "long",
  },
  {
    slug: "large-form-end",
    displayName: "Encerrar Forma Grande",
    raceSlug: "goliath",
    requiredLevel: 5,
    actionCost: "free",
    targetShape: "self",
    resolution: "stub",
  },
  {
    slug: "moonlight-step",
    displayName: "Passo ao Luar",
    classSlug: "druid",
    sourceEdition: "XPHB",
    requiredLevel: 10,
    actionCost: "bonus",
    targetShape: "self",
    targetRange: 30,
    resolution: "stub",
    rechargeOn: "long",
  },
  {
    slug: "moonlight-step-recover",
    displayName: "Recuperar Passo ao Luar",
    classSlug: "druid",
    sourceEdition: "XPHB",
    requiredLevel: 10,
    actionCost: "free",
    targetShape: "self",
    resolution: "stub",
  },
  {
    slug: "druid-hit-riders",
    displayName: "Efeitos do acerto do Druida",
    classSlug: "druid",
    sourceEdition: "XPHB",
    requiredLevel: 7,
    actionCost: "free",
    targetShape: "single-creature",
    resolution: "stub",
    trigger: "on-hit",
  },

  {
    slug: "second-wind",
    displayName: "Segundo Fôlego",
    classSlug: "fighter",
    requiredLevel: 1,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "full",
    maxUsesByLevel: (lv) => getSecondWindMaxUses(lv, true),
    rechargeOn: "short",
  },
  {
    slug: "action-surge",
    displayName: "Surto de Ação",
    classSlug: "fighter",
    requiredLevel: 2,
    actionCost: "free",
    targetShape: "self",
    resolution: "full",
    maxUsesByLevel: (lv) => (lv >= 17 ? 2 : 1),
    rechargeOn: "short",
  },
  {

    slug: "indomitable",
    displayName: "Indomável",
    classSlug: "fighter",
    requiredLevel: 9,
    actionCost: "free",
    targetShape: "self",
    resolution: "full",
    maxUsesByLevel: (lv) => (lv >= 17 ? 3 : lv >= 13 ? 2 : 1),
    rechargeOn: "short",
  },

  {
    slug: "rage",
    displayName: "Fúria",
    classSlug: "barbarian",
    requiredLevel: 1,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",
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
    rechargeOn: "long",
  },
  {
    slug: "reckless-attack",
    displayName: "Ataque Imprudente",
    classSlug: "barbarian",
    requiredLevel: 2,
    actionCost: "free",
    targetShape: "self",
    resolution: "full",
  },

  {
    slug: "lay-on-hands",
    displayName: "Imposição de Mãos",
    classSlug: "paladin",
    requiredLevel: 1,
    actionCost: "bonus",
    targetShape: "single-creature",
    targetRange: 5,
    resolution: "full",
    maxUsesByLevel: (lv) => lv * 5,
    rechargeOn: "long",
  },
  {
    slug: "divine-sense",
    displayName: "Sentido Divino",
    classSlug: "paladin",
    requiredLevel: 1,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",
    maxUsesByLevel: () => 1,
    rechargeOn: "long",
  },
  {
    slug: "healing-hands",
    displayName: "Mãos Curativas",
    raceSlug: "aasimar",
    requiredLevel: 1,
    actionCost: "action",
    targetShape: "single-creature",
    targetRange: 5,
    resolution: "full",
    maxUsesByLevel: () => 1,
    rechargeOn: "long",
  },
  {
    slug: "celestial-revelation",
    displayName: "Revelação Celestial",
    raceSlug: "aasimar",
    requiredLevel: 3,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "full",
    maxUsesByLevel: () => 1,
    rechargeOn: "long",
  },
  {
    slug: "abjure-foes",
    displayName: "Abjurar Inimigos",
    classSlug: "paladin",
    sourceEdition: "XPHB",
    requiredLevel: 9,
    actionCost: "action",
    targetShape: "multiple-creatures",
    targetRange: 60,
    resolution: "stub",
    maxUsesByLevel: () => 2,
    usesSharedWith: "channel-divinity",
    rechargeOn: "short",
  },
  {
    slug: "faithful-steed",
    displayName: "Corcel Fiel",
    classSlug: "paladin",
    sourceEdition: "XPHB",
    requiredLevel: 5,
    actionCost: "action",
    targetShape: "self",
    targetRange: 30,
    resolution: "stub",
  },

  {
    slug: "channel-divinity",
    displayName: "Canalizar Divindade",
    classSlug: "cleric",
    requiredLevel: 2,
    actionCost: "action",
    targetShape: "single-creature",
    targetRange: 30,
    resolution: "stub",
    maxUsesByLevel: (lv) => (lv >= 18 ? 3 : lv >= 6 ? 2 : 1),
    rechargeOn: "short",
  },
  {

    slug: "turn-undead",
    displayName: "Expulsar Mortos-Vivos",
    classSlug: "cleric",
    requiredLevel: 2,
    actionCost: "action",
    targetShape: "multiple-creatures",
    targetRange: 30,
    resolution: "stub",
    maxUsesByLevel: (lv) => (lv >= 18 ? 3 : lv >= 6 ? 2 : 1),
    rechargeOn: "short",
  },

  {


    slug: "arcane-recovery",
    displayName: "Recuperação Arcana",
    classSlug: "wizard",
    requiredLevel: 1,
    actionCost: "free",
    targetShape: "self",
    resolution: "stub",
    maxUsesByLevel: () => 1,
    rechargeOn: "long",
  },

  {
    slug: "wild-shape",
    displayName: "Forma Selvagem",
    classSlug: "druid",
    requiredLevel: 2,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",

    maxUsesByLevel: (level: number) =>
      level >= 17 ? 4 : level >= 6 ? 3 : 2,
    rechargeOn: "short",
  },
  {
    slug: "wild-companion",
    displayName: "Companheiro Selvagem",
    classSlug: "druid",
    sourceEdition: "XPHB",
    requiredLevel: 2,
    actionCost: "action",
    targetShape: "self",
    resolution: "stub",
  },
  {
    slug: "natural-recovery",
    displayName: "Recuperação Natural",
    classSlug: "druid",
    requiredLevel: 2,
    actionCost: "free",
    targetShape: "self",
    resolution: "stub",
    maxUsesByLevel: () => 1,
    rechargeOn: "long",
  },
  {
    slug: "wild-resurgence",
    displayName: "Ressurgência Selvagem",
    classSlug: "druid",
    sourceEdition: "XPHB",
    requiredLevel: 5,
    actionCost: "free",
    targetShape: "self",
    resolution: "stub",
  },

  {
    slug: "bardic-inspiration",
    displayName: "Inspiração Bárdica",
    classSlug: "bard",
    requiredLevel: 1,
    actionCost: "bonus",
    targetShape: "single-creature",
    targetRange: 60,
    resolution: "stub",

    maxUsesByLevel: () => 1,
    rechargeOn: "long",
  },




  {
    slug: "cutting-words",
    displayName: "Palavras Cortantes",
    classSlug: "bard",
    requiredLevel: 3,
    actionCost: "reaction",
    targetShape: "single-creature",
    targetRange: 60,
    resolution: "full",
    usesSharedWith: "bardic-inspiration",
  },




  {
    slug: "countercharm",
    displayName: "Contrafeitiço",
    classSlug: "bard",
    requiredLevel: 5,
    actionCost: "reaction",
    targetShape: "single-creature",
    targetRange: 30,
    resolution: "full",
  },

  {
    slug: "cunning-action",
    displayName: "Ação Ardilosa",
    classSlug: "rogue",
    requiredLevel: 2,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "wrapper",
  },
  {
    slug: "steady-aim",
    displayName: "Mira Firme",
    classSlug: "rogue",
    sourceEdition: "XPHB",
    requiredLevel: 3,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",
  },
  {
    slug: "cunning-strike",
    displayName: "Golpe Ardiloso",
    classSlug: "rogue",
    sourceEdition: "XPHB",
    requiredLevel: 5,
    actionCost: "free",
    targetShape: "single-creature",
    resolution: "stub",
  },
  {
    slug: "uncanny-dodge",
    displayName: "Esquiva Sobrenatural",
    classSlug: "rogue",
    requiredLevel: 5,
    actionCost: "reaction",
    targetShape: "self",
    resolution: "stub",
  },

  {
    slug: "martial-arts-bonus",
    displayName: "Artes Marciais: Ataque Bônus",
    classSlug: "monk",
    requiredLevel: 1,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",
  },
  {
    slug: "flurry-of-blows",
    displayName: "Rajada de Golpes",
    classSlug: "monk",
    requiredLevel: 2,
    actionCost: "bonus",
    targetShape: "multiple-creatures",
    targetRange: 5,
    resolution: "stub",
  },
  {
    slug: "patient-defense-disengage",
    displayName: "Defesa Paciente: Desengajar",
    classSlug: "monk",
    requiredLevel: 2,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",
  },
  {
    slug: "patient-defense",
    displayName: "Defesa Paciente",
    classSlug: "monk",
    requiredLevel: 2,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",
  },
  {
    slug: "step-of-the-wind-dash",
    displayName: "Passo do Vento: Disparada",
    classSlug: "monk",
    requiredLevel: 2,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",
  },
  {
    slug: "step-of-the-wind",
    displayName: "Passo do Vento",
    classSlug: "monk",
    requiredLevel: 2,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",
  },
  {
    slug: "stunning-strike",
    displayName: "Golpe Atordoante",
    classSlug: "monk",
    requiredLevel: 5,
    actionCost: "free",
    targetShape: "single-creature",
    targetRange: 5,
    resolution: "stub",
  },
  {
    slug: "deflect-attacks",
    displayName: "Desviar Ataques",
    classSlug: "monk",
    requiredLevel: 3,
    actionCost: "reaction",
    targetShape: "self",
    resolution: "stub",
  },
  {
    slug: "open-hand-technique-addle",
    displayName: "Técnica da Mão Aberta: Aturdir",
    classSlug: "monk",
    requiredLevel: 3,
    actionCost: "free",
    targetShape: "single-creature",
    targetRange: 5,
    resolution: "stub",
  },
  {
    slug: "open-hand-technique-push",
    displayName: "Técnica da Mão Aberta: Empurrar",
    classSlug: "monk",
    requiredLevel: 3,
    actionCost: "free",
    targetShape: "single-creature",
    targetRange: 5,
    resolution: "stub",
  },
  {
    slug: "open-hand-technique-topple",
    displayName: "Técnica da Mão Aberta: Derrubar",
    classSlug: "monk",
    requiredLevel: 3,
    actionCost: "free",
    targetShape: "single-creature",
    targetRange: 5,
    resolution: "stub",
  },

  {
    slug: "metamagic",
    displayName: "Metamagia",
    classSlug: "sorcerer",
    requiredLevel: 3,
    actionCost: "free",
    targetShape: "none",
    resolution: "stub",
  },

  {
    slug: "pact-of-the-blade-summon",
    displayName: "Invocar Lâmina do Pacto",
    classSlug: "warlock",
    requiredLevel: 3,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",
  },
  {
    slug: "dark-ones-blessing",
    displayName: "Bênção Fiendish (Dark One's Blessing)",
    classSlug: "warlock",
    requiredLevel: 1,
    actionCost: "free",
    targetShape: "self",
    resolution: "stub",
  },
  {
    slug: "dark-ones-own-luck",
    displayName: "Sorte Fiendish (Dark One's Own Luck)",
    classSlug: "warlock",
    requiredLevel: 6,
    actionCost: "reaction",
    targetShape: "self",
    resolution: "stub",
    maxUsesByLevel: () => 1,
    rechargeOn: "short",
  },

  {
    slug: "favored-enemy",
    displayName: "Inimigo Favorito",
    classSlug: "ranger",
    requiredLevel: 1,
    actionCost: "free",
    targetShape: "self",
    resolution: "stub",
    maxUsesByLevel: (lv) =>
      lv >= 17 ? 6 : lv >= 13 ? 5 : lv >= 9 ? 4 : lv >= 5 ? 3 : 2,
    rechargeOn: "long",
  },
  {
    slug: "tireless",
    displayName: "Incansável",
    classSlug: "ranger",
    requiredLevel: 10,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",
    maxUsesByLevel: () => 1,
    rechargeOn: "short",
  },
  {
    slug: "natures-veil",
    displayName: "Véu da Natureza",
    classSlug: "ranger",
    requiredLevel: 13,
    actionCost: "bonus",
    targetShape: "self",
    resolution: "stub",
    maxUsesByLevel: () => 1,
    rechargeOn: "long",
  },
];
