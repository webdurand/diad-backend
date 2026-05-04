/**
 * Word-list match descritor → archetype slug. Default conservador `commoner`.
 * Caller usa pra criar stub via NpcService.create — resolveArchetype popula
 * monsterId, combate roda com stats RAW do template.
 *
 * Slugs válidos em `npc_archetype_templates`:
 *   commoner, acolyte, guard, noble, thug, bandit, cultist,
 *   bandit_captain, cult_fanatic, spy, priest, veteran, mage, assassin
 */

interface ArchetypeRule {
  archetype: string;
  keywords: string[];
}

// Ordem importa — primeira match wins. Mais específicos primeiro.
const RULES: ArchetypeRule[] = [
  // Lawful order (cidades, templos)
  {
    archetype: "guard",
    keywords: [
      "guarda",
      "soldado",
      "vigilante",
      "patrulha",
      "miliciano",
      "sentinela",
    ],
  },
  {
    archetype: "priest",
    keywords: [
      "padre",
      "sacerdote",
      "frei",
      "pastor",
      "arquipreste",
      "bispo",
      "monge",
    ],
  },
  {
    archetype: "acolyte",
    keywords: ["noviço", "acólito", "aprendiz de templo", "irmão"],
  },

  // Combatentes hostis (antagonistas comuns)
  {
    archetype: "bandit_captain",
    keywords: [
      "líder de bandidos",
      "capitão de bandidos",
      "chefe da gangue",
      "coronel",
    ],
  },
  {
    archetype: "veteran",
    keywords: [
      "veterano",
      "espadachim experiente",
      "mercenário sênior",
      "soldado curtido",
      "braço grosso",
    ],
  },
  {
    archetype: "thug",
    keywords: [
      "capanga",
      "valentão",
      "punhos",
      "brigão",
      "musculoso",
      "mão pesada",
      "executor",
    ],
  },
  {
    archetype: "bandit",
    keywords: [
      "bandido",
      "ladrão",
      "salteador",
      "cacete",
      "porrete",
      "facínora",
      "gatuno",
    ],
  },

  // Cultistas / hereges
  {
    archetype: "cult_fanatic",
    keywords: ["fanático", "líder cultista", "alto-sacerdote do culto"],
  },
  {
    archetype: "cultist",
    keywords: ["cultista", "herege", "iniciado do culto", "devoto sombrio"],
  },

  // Conjuradores
  {
    archetype: "mage",
    keywords: [
      "mago",
      "feiticeiro",
      "bruxo",
      "arcano",
      "conjurador",
      "estudioso",
    ],
  },
  {
    archetype: "assassin",
    keywords: ["assassino", "matador de aluguel", "lâmina silenciosa"],
  },
  {
    archetype: "spy",
    keywords: ["espião", "informante", "agente disfarçado", "infiltrado"],
  },

  // Civis (default tier)
  {
    archetype: "noble",
    keywords: [
      "nobre",
      "senhor",
      "fidalgo",
      "barão",
      "donzela",
      "dama da corte",
    ],
  },
  // commoner é o fallback default — não precisa rule
];

const DESCRIPTOR_NORMALIZE_RE = /[^\p{L}\s]/gu;

/**
 * Recebe descritor livre (ex: "bartender queimado de sol, cicatriz",
 * "homem de braço grosso com cacete") e retorna archetype slug.
 *
 * Usa lowercase + remove pontuação + match word-by-word contra keywords.
 * Default: `commoner`.
 */
export function pickArchetypeFromDescriptor(descriptor: string): string {
  if (!descriptor) return "commoner";
  const normalized = descriptor
    .toLowerCase()
    .replace(DESCRIPTOR_NORMALIZE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const rule of RULES) {
    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword)) {
        return rule.archetype;
      }
    }
  }
  return "commoner";
}
