

interface ArchetypeRule {
  archetype: string;
  keywords: string[];
}


const RULES: ArchetypeRule[] = [

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


  {
    archetype: "cult_fanatic",
    keywords: ["fanático", "líder cultista", "alto-sacerdote do culto"],
  },
  {
    archetype: "cultist",
    keywords: ["cultista", "herege", "iniciado do culto", "devoto sombrio"],
  },


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

];

const DESCRIPTOR_NORMALIZE_RE = /[^\p{L}\s]/gu;


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
