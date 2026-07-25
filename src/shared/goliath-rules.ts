export type GiantAncestryChoice =
  | "clouds-jaunt"
  | "fires-burn"
  | "frosts-chill"
  | "hills-tumble"
  | "stones-endurance"
  | "storms-thunder";

const GIANT_ANCESTRY_ALIASES: Record<string, GiantAncestryChoice> = {
  "clouds jaunt": "clouds-jaunt",
  "cloud giant": "clouds-jaunt",
  "fires burn": "fires-burn",
  "fire giant": "fires-burn",
  "frosts chill": "frosts-chill",
  "frost giant": "frosts-chill",
  "hills tumble": "hills-tumble",
  "hill giant": "hills-tumble",
  "stones endurance": "stones-endurance",
  "stone giant": "stones-endurance",
  "storms thunder": "storms-thunder",
  "storm giant": "storms-thunder",
};

export const GIANT_ANCESTRY_DISPLAY_NAMES: Record<
  GiantAncestryChoice,
  string
> = {
  "clouds-jaunt": "Salto das Nuvens",
  "fires-burn": "Queimadura do Fogo",
  "frosts-chill": "Calafrio do Gelo",
  "hills-tumble": "Queda da Colina",
  "stones-endurance": "Resistência da Pedra",
  "storms-thunder": "Trovão da Tempestade",
};

export const GIANT_ANCESTRY_DESCRIPTIONS: Record<
  GiantAncestryChoice,
  string
> = {
  "clouds-jaunt":
    "Como ação bônus, teleporte-se magicamente até 30 pés para um espaço desocupado que você possa ver.",
  "fires-burn":
    "Quando acertar um alvo com uma jogada de ataque e causar dano, você pode causar também 1d10 de dano de fogo ao alvo.",
  "frosts-chill":
    "Quando acertar um alvo com uma jogada de ataque e causar dano, você pode causar também 1d6 de dano de frio e reduzir o deslocamento dele em 10 pés até o início do seu próximo turno.",
  "hills-tumble":
    "Quando acertar uma criatura Grande ou menor com uma jogada de ataque e causar dano, você pode deixá-la Caída.",
  "stones-endurance":
    "Quando sofrer dano, use uma reação para rolar 1d12, somar seu modificador de Constituição e reduzir o dano por esse total.",
  "storms-thunder":
    "Quando sofrer dano de uma criatura a até 60 pés, use uma reação para causar 1d8 de dano trovejante a ela.",
};

export function normalizeGiantAncestryChoice(
  value: unknown,
): GiantAncestryChoice | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return GIANT_ANCESTRY_ALIASES[normalized] ?? null;
}

export function findGiantAncestryChoice(
  choices: unknown,
): GiantAncestryChoice | null {
  if (!Array.isArray(choices)) return null;
  for (const choice of choices) {
    const normalized = normalizeGiantAncestryChoice(choice);
    if (normalized) return normalized;
  }
  return null;
}

export function proficiencyBonusForLevel(totalLevel: number): number {
  const safeLevel = Math.max(1, Math.min(20, Math.floor(totalLevel || 1)));
  return 2 + Math.floor((safeLevel - 1) / 4);
}
