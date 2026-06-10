import { Injectable, Logger } from "@nestjs/common";
import { DataSource, In, IsNull } from "typeorm";
import {
  CampaignEntity,
  LocationConnectionEntity,
  LocationEntity,
  NpcEntity,
} from "src/entities";
import {
  WorldSeedMaterializationService,
  type NpcSeedDisposition,
  type WorldSeedMaterializeBody,
} from "./world-seed-materialization.service";

// Avaliação 2026-06-10 (P0 #3): o fluxo solo (`POST /ai/solo/create` → agents
// `generate_campaign`, spec 027 C2) cria de propósito um mundo quase vazio —
// 2 locations genéricas, 0 NPCs, 0 conexões, 0 POIs nomeados. O hub nasce
// morto: diálogo inacessível, `reachable-locations` retorna [] e o Narrator
// inventa um mundo que o motor desconhece.
//
// Este serviço é o piso jogável determinístico: na criação de sessão, se o
// mundo da campanha (dmMode=ai, não-sandbox) está vazio (0 NPCs canônicos e
// 0 conexões), materializa um seed template estático PT-BR genérico-medieval
// pelas MESMAS services do fluxo "preparar" (WorldSeedMaterializationService
// — a mesma rota de `POST /campaigns/:id/world-seed/materialize`). Nenhuma
// chamada LLM: o mundo nunca nasce vazio mesmo sem agents no ar.
//
// Anti-contaminação (motivo da spec 027 ter removido templates nomeados):
// aqui os nomes próprios são escolhidos de pools pequenos por hash estável do
// campaignId — determinístico por campanha, variado entre campanhas, e 100%
// conhecido pelo motor (o oposto do problema original, em que o LLM "lembrava"
// nomes que o banco não tinha).

export interface MinimalWorldSeedOptions {
  /** Chave estável (campaignId) usada para variar nomes entre campanhas. */
  seedKey?: string | null;
  /** Tom da campanha (epico, misterioso, comico, sombrio) — adapta atmosfera. */
  tone?: string | null;
  /** Nome da location-hub existente (ex.: "Vila inicial"); default cria uma. */
  hubName?: string | null;
  /** Nome da sub-location de chegada existente (ex.: "Praça central"). */
  plazaName?: string | null;
}

interface NamedPick {
  name: string;
  title: string;
}

const TAVERN_NAMES = [
  "Taverna do Javali Dourado",
  "Taverna da Lanterna Acesa",
  "Taverna do Corvo Manso",
  "Taverna do Caldeirão Farto",
];

const MARKET_NAMES = [
  "Mercado das Quatro Bancas",
  "Feira do Sino Velho",
  "Mercado da Balança Justa",
  "Empório da Rota Norte",
];

const TEMPLE_NAMES = [
  "Templo da Chama Serena",
  "Capela do Amanhecer",
  "Santuário das Águas Calmas",
  "Ermida do Carvalho Antigo",
];

const TAVERN_KEEPERS: NamedPick[] = [
  { name: "Bram Tonelada", title: "Taverneiro" },
  { name: "Helga Barril", title: "Taverneira" },
  { name: "Guto Espuma", title: "Taverneiro" },
  { name: "Oda Canecas", title: "Taverneira" },
];

const MERCHANTS: NamedPick[] = [
  { name: "Mira Fiodouro", title: "Mercadora" },
  { name: "Vado Meiopreço", title: "Mercador" },
  { name: "Tessa Boamoeda", title: "Mercadora" },
  { name: "Sergo Cobrejusto", title: "Mercador" },
];

const PRIESTS: NamedPick[] = [
  { name: "Irmão Anselmo", title: "Sacerdote do templo" },
  { name: "Irmã Cecília", title: "Sacerdotisa do templo" },
  { name: "Padre Bartolo", title: "Sacerdote do templo" },
  { name: "Irmã Dorotéia", title: "Sacerdotisa do templo" },
];

const GUARD_CAPTAINS: NamedPick[] = [
  { name: "Duna Ferreira", title: "Capitã da guarda" },
  { name: "Rolf Pedravelha", title: "Capitão da guarda" },
  { name: "Inês Brasão", title: "Capitã da guarda" },
  { name: "Telmo Escudo", title: "Capitão da guarda" },
];

const MESSENGERS: NamedPick[] = [
  { name: "Nico Pé-Ligeiro", title: "Recadeiro da praça" },
  { name: "Lila Recados", title: "Recadeira da praça" },
  { name: "Tito Assobio", title: "Recadeiro da praça" },
  { name: "Bia Atalhos", title: "Recadeira da praça" },
];

const STALL_VENDORS: NamedPick[] = [
  { name: "Rosa Hortelã", title: "Feirante" },
  { name: "Beto Couves", title: "Feirante" },
  { name: "Dona Quita", title: "Feirante" },
  { name: "Mano Cestas", title: "Feirante" },
];

const ELDERS: NamedPick[] = [
  { name: "Velha Sálvia", title: "Cronista da vila" },
  { name: "Mestre Otto", title: "Cronista da vila" },
  { name: "Vó Almira", title: "Cronista da vila" },
  { name: "Velho Brás", title: "Cronista da vila" },
];

const INNKEEPERS: NamedPick[] = [
  { name: "Cosme Estrada", title: "Estalajadeiro do posto" },
  { name: "Marta Poeira", title: "Estalajadeira do posto" },
  { name: "Justo Albergue", title: "Estalajadeiro do posto" },
  { name: "Nara Lampião", title: "Estalajadeira do posto" },
];

const HUB_ATMOSPHERE_BY_TONE: Record<string, string> = {
  epico:
    "O vento traz cheiro de pão quente e ferro batido. Estandartes desbotados balançam como se esperassem um herói.",
  misterioso:
    "Conversas morrem quando um forasteiro passa. Olhares de canto acompanham cada passo entre as casas.",
  comico:
    "Uma galinha foge de um aprendiz desastrado. Todo mundo tem opinião sobre tudo e ninguém resolve nada.",
  sombrio:
    "Portas se fecham cedo demais. Há flores murchas num memorial improvisado que ninguém explica.",
};

const DEFAULT_HUB_ATMOSPHERE =
  "Movimento simples de vila: carroças, sinos distantes e conversa baixa nas soleiras.";

export const MINIMAL_WORLD_DEFAULT_HUB_NAME = "Vila inicial";
export const MINIMAL_WORLD_DEFAULT_PLAZA_NAME = "Praça central";
export const MINIMAL_WORLD_ROAD_NAME = "Estrada do Comércio";
export const MINIMAL_WORLD_FOREST_NAME = "Floresta de Pinhos Altos";
export const MINIMAL_WORLD_RUINS_NAME = "Ruínas do Moinho Velho";

/** Hash estável e simples (FNV-1a 32 bits) para variar pools por campanha. */
function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pick<T>(pool: T[], hash: number, slot: number): T {
  return pool[(hash + slot * 7) % pool.length];
}

/**
 * Seed template estático PT-BR genérico-medieval — o "mundo mínimo jogável":
 *   - 5 locations conectadas (hub + praça + estrada + floresta + ruínas)
 *   - 4 conexões com travel_time 1-3h
 *   - 3 POIs nomeados e descritos no hub + 2 na praça de chegada
 *   - 8 NPCs com nome, papel, disposition e location — a materialização
 *     distribui homePoiId pelos POIs e corta pelo contentBudget.maxNpcs
 *     da campanha (mínimo efetivo: 6).
 * Determinístico: mesma campanha → mesmo mundo; sem chamadas LLM.
 */
export function buildMinimalWorldSeedBody(
  options: MinimalWorldSeedOptions = {},
): WorldSeedMaterializeBody {
  const hash = stableHash(options.seedKey ?? "diad-minimal-world");
  const hubName = options.hubName?.trim() || MINIMAL_WORLD_DEFAULT_HUB_NAME;
  let plazaName = options.plazaName?.trim() || MINIMAL_WORLD_DEFAULT_PLAZA_NAME;
  if (plazaName.toLowerCase() === hubName.toLowerCase()) {
    plazaName = MINIMAL_WORLD_DEFAULT_PLAZA_NAME;
  }
  const tone = options.tone?.trim().toLowerCase() ?? "";
  const hubAtmosphere = HUB_ATMOSPHERE_BY_TONE[tone] ?? DEFAULT_HUB_ATMOSPHERE;

  const tavern = pick(TAVERN_NAMES, hash, 0);
  const market = pick(MARKET_NAMES, hash, 1);
  const temple = pick(TEMPLE_NAMES, hash, 2);

  const tavernKeeper = pick(TAVERN_KEEPERS, hash, 0);
  const merchant = pick(MERCHANTS, hash, 1);
  const priest = pick(PRIESTS, hash, 2);
  const captain = pick(GUARD_CAPTAINS, hash, 3);
  const messenger = pick(MESSENGERS, hash, 4);
  const vendor = pick(STALL_VENDORS, hash, 5);
  const elder = pick(ELDERS, hash, 6);
  const innkeeper = pick(INNKEEPERS, hash, 7);

  const npc = (
    person: NamedPick,
    extras: {
      role: string;
      race?: string;
      disposition: NpcSeedDisposition;
      archetype_slug?: string;
      location_name: string;
      motivation: string;
      dialogue_style: string;
      knowledge_scope: string[];
      description: string;
      description_hidden?: string;
    },
  ) => ({
    name: person.name,
    title: person.title,
    race: extras.race ?? "Humano",
    role: extras.role,
    profile_depth: "core" as const,
    archetype_slug: extras.archetype_slug ?? "commoner",
    location_name: extras.location_name,
    disposition: extras.disposition,
    motivation: extras.motivation,
    knowledge_scope: extras.knowledge_scope,
    dialogue_style: extras.dialogue_style,
    description: extras.description,
    ...(extras.description_hidden
      ? { description_hidden: extras.description_hidden }
      : {}),
  });

  return {
    startingLocationName: hubName,
    context: {
      locations: [
        {
          name: hubName,
          type: "city",
          description:
            "Uma pequena vila de fronteira: casas de pedra e madeira, telhados baixos e cercas tortas. Tudo que acontece aqui vira assunto na taverna em uma hora.",
          atmosphere: hubAtmosphere,
          tags: ["vila", "fronteira", "seguro"],
          pois: [
            {
              name: tavern,
              type: "tavern",
              isDefault: true,
              description:
                "Salão de vigas escuras, lareira sempre acesa e canecas que nunca ficam vazias por muito tempo. É onde a vila conversa, negocia e exagera histórias.",
              atmosphere: "Quente, barulhenta, cheiro de ensopado e cerveja.",
              tags: ["social", "rumores", "descanso"],
            },
            {
              name: market,
              type: "market",
              description:
                "Bancas de lona desbotada vendendo de tudo um pouco: rações, cordas, ervas, ferramentas e a fofoca mais fresca da região.",
              atmosphere: "Regateio constante, galinhas soltas, sacas empilhadas.",
              tags: ["comercio", "suprimentos"],
            },
            {
              name: temple,
              type: "temple",
              description:
                "Construção modesta de pedra clara com velas acesas dia e noite. Recebe doentes, viajantes e quem precisa de uma palavra calma.",
              atmosphere: "Silêncio morno, cheiro de cera e incenso.",
              tags: ["fe", "cura", "refugio"],
            },
          ],
        },
        {
          name: plazaName,
          type: "outdoor",
          parent_name: hubName,
          description:
            "O coração aberto da vila: chão de pedra irregular, um poço antigo no centro e espaço de sobra para feiras, anúncios e despedidas.",
          atmosphere: "Movimento moderado; todo mundo cruza por aqui pelo menos uma vez ao dia.",
          tags: ["vila", "encontro"],
          pois: [
            {
              name: "Poço de Pedra",
              type: "landmark",
              isDefault: true,
              description:
                "Poço circular de pedra gasta, corda nova e balde remendado. Ponto de encontro oficial da vila — e fonte de metade dos boatos dela.",
              atmosphere: "Água fresca, conversa fiada, baldes batendo.",
              tags: ["encontro", "rumores"],
            },
            {
              name: "Mural de Avisos",
              type: "landmark",
              description:
                "Tábuas cheias de papéis pregados: recompensas, avisos do conselho, pedidos de ajuda e uma ou outra ameaça mal escrita.",
              atmosphere: "Papéis farfalhando ao vento.",
              tags: ["trabalho", "pistas"],
            },
          ],
        },
        {
          name: MINIMAL_WORLD_ROAD_NAME,
          type: "region",
          description:
            "Caminho de terra batida que liga a vila ao resto do mundo. Marcos de pedra contam as léguas; caravanas param no posto para a noite.",
          atmosphere: "Poeira, sinos de mula e a promessa de notícias de longe.",
          tags: ["estrada", "viagem"],
          pois: [
            {
              name: "Posto da Estrada",
              type: "inn",
              isDefault: true,
              description:
                "Estalagem de beira de estrada com estábulo, caldo quente e camas duras. Quem viaja passa por aqui — e quem foge também.",
              atmosphere: "Lampiões acesos, viajantes calados, mapas na parede.",
              tags: ["descanso", "viajantes", "rumores"],
            },
          ],
        },
        {
          name: MINIMAL_WORLD_FOREST_NAME,
          type: "wilderness",
          description:
            "Pinheiros altos demais e silêncio de mais. Os caçadores conhecem as trilhas seguras; o resto da vila prefere nem precisar conhecer.",
          atmosphere: "Sombra fria, agulhas no chão, estalos entre as árvores.",
          tags: ["selvagem", "caca"],
          pois: [
            {
              name: "Clareira dos Caçadores",
              type: "camp",
              description:
                "Círculo de pedras enegrecidas por fogueiras antigas, peles esticadas e marcas de caça entalhadas nos troncos.",
              atmosphere: "Cheiro de cinza fria e resina.",
              tags: ["acampamento", "caca"],
            },
          ],
        },
        {
          name: MINIMAL_WORLD_RUINS_NAME,
          type: "ruin",
          description:
            "Um moinho de pedra abandonado há uma geração, de pás quebradas e porão fundo. Ninguém da vila admite por que pararam de moer ali.",
          description_hidden:
            "O porão do moinho esconde sinais de ocupação recente — alguém (ou algo) voltou a usar o lugar.",
          atmosphere: "Madeira rangendo, mato alto, corvos no telhado.",
          tags: ["ruinas", "perigo", "misterio"],
          pois: [
            {
              name: "Pátio do Moinho",
              type: "ruins",
              description:
                "Pátio tomado pelo mato entre a roda d'água parada e a porta principal arrombada. Pegadas recentes na lama contradizem o abandono.",
              atmosphere: "Vento assobiando nas pás quebradas.",
              tags: ["exploracao", "pistas"],
            },
          ],
        },
      ],
      npcs: [
        npc(tavernKeeper, {
          role: "taverneiro",
          disposition: "friendly",
          location_name: hubName,
          motivation: "Manter a taverna cheia e a vila em paz — nessa ordem.",
          dialogue_style: "Falante, hospitaleiro, troca bebida por história.",
          knowledge_scope: ["vila", "rumores", "viajantes", "estrada"],
          description:
            "Braços de quem carrega barril e memória de quem ouve todo mundo. Sabe quem chegou, quem partiu e quem deve.",
        }),
        npc(merchant, {
          role: "mercador",
          disposition: "neutral",
          location_name: hubName,
          motivation: "Comprar barato, vender caro e farejar oportunidade antes dos outros.",
          dialogue_style: "Calculista e simpática na medida do lucro.",
          knowledge_scope: ["comercio", "precos", "caravanas", "estrada"],
          description:
            "Conhece o valor de tudo que passa pela vila — e cobra por essa informação também.",
        }),
        npc(priest, {
          role: "sacerdote",
          disposition: "friendly",
          archetype_slug: "priest",
          location_name: hubName,
          motivation: "Cuidar dos aflitos e impedir que a vila perca a esperança.",
          dialogue_style: "Pausado, gentil, fala em parábolas curtas.",
          knowledge_scope: ["templo", "cura", "historia local", "ritos"],
          description:
            "Mãos calejadas de trabalho e voz que acalma. O templo é pequeno, mas nunca fecha.",
        }),
        npc(captain, {
          role: "guarda",
          disposition: "neutral",
          archetype_slug: "guard",
          location_name: hubName,
          motivation: "Manter a lei com a pouca guarda que tem — e sem heroísmo desnecessário.",
          dialogue_style: "Direta, militar, mede o interlocutor antes de confiar.",
          knowledge_scope: ["guarda", "lei", "ameacas", "estrada", "ruinas"],
          description:
            "Cota de malha remendada e olhar de quem já viu encrenca demais para uma vila deste tamanho.",
        }),
        npc(messenger, {
          role: "recadeiro",
          disposition: "friendly",
          location_name: plazaName,
          motivation: "Saber de tudo primeiro e ser pago em moedas ou doces por isso.",
          dialogue_style: "Rápido, curioso, fala mais do que devia.",
          knowledge_scope: ["fofocas", "atalhos", "moradores", "praca"],
          description:
            "Pés descalços e ouvidos em todo lugar. Se aconteceu na vila, já sabe; se não sabe, descobre.",
        }),
        npc(vendor, {
          role: "feirante",
          disposition: "neutral",
          location_name: plazaName,
          motivation: "Vender a colheita do dia antes do sol baixar.",
          dialogue_style: "Pragmática, bem-humorada, negocia tudo.",
          knowledge_scope: ["feira", "colheita", "clima", "vizinhos"],
          description:
            "Banca arrumada com capricho e balança honesta — desde que ninguém aperte demais no preço.",
        }),
        npc(elder, {
          role: "cronista",
          disposition: "indifferent",
          location_name: hubName,
          motivation: "Lembrar o que a vila prefere esquecer.",
          dialogue_style: "Seca, elíptica, responde com outra pergunta.",
          knowledge_scope: ["historia local", "moinho", "fundadores", "segredos"],
          description:
            "Guarda os registros da vila desde antes de muita gente nascer. Fala pouco; quando fala, pesa.",
          description_hidden:
            "Sabe por que o Moinho Velho foi abandonado — e quem mandou calar o assunto.",
        }),
        npc(innkeeper, {
          role: "estalajadeiro",
          disposition: "neutral",
          location_name: MINIMAL_WORLD_ROAD_NAME,
          motivation: "Manter o posto neutro: cama e caldo para qualquer um que pague.",
          dialogue_style: "Econômico, observador, não toma partido.",
          knowledge_scope: ["estrada", "caravanas", "viajantes", "ruinas"],
          description:
            "Vê todo mundo que entra e sai da região pela estrada — e cobra discrição como cobra a estadia.",
        }),
      ],
    },
    connections: [
      {
        from_name: hubName,
        to_name: plazaName,
        travel_hours: 1,
        description: "Ruela curta entre as casas que desemboca na praça.",
      },
      {
        from_name: hubName,
        to_name: MINIMAL_WORLD_ROAD_NAME,
        travel_hours: 2,
        description: "Caminho de terra batida que segue os marcos de légua.",
      },
      {
        from_name: hubName,
        to_name: MINIMAL_WORLD_FOREST_NAME,
        travel_hours: 3,
        description: "Trilha de caça que some entre os pinhos altos.",
      },
      {
        from_name: MINIMAL_WORLD_ROAD_NAME,
        to_name: MINIMAL_WORLD_RUINS_NAME,
        travel_hours: 2,
        description: "Desvio coberto de mato que termina no moinho abandonado.",
      },
    ],
  };
}

@Injectable()
export class MinimalWorldSeedService {
  private readonly logger = new Logger(MinimalWorldSeedService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly worldSeedMaterializationService: WorldSeedMaterializationService,
  ) {}

  /**
   * Garante que uma campanha conduzida por IA tenha um mundo mínimo jogável.
   * Dispara somente quando o mundo está comprovadamente vazio (0 NPCs
   * canônicos E 0 conexões) — mundos preparados/autorados nunca são tocados.
   * Retorna a campanha atualizada quando materializa; null quando pulou.
   */
  async ensureMinimalPlayableWorld(
    campaign: CampaignEntity,
  ): Promise<CampaignEntity | null> {
    if (campaign.dmMode !== "ai" || campaign.isSandbox) return null;

    const locationRepo = this.dataSource.getRepository(LocationEntity);
    const npcRepo = this.dataSource.getRepository(NpcEntity);
    const connectionRepo = this.dataSource.getRepository(LocationConnectionEntity);

    const [locations, npcCount] = await Promise.all([
      locationRepo.find({
        where: { campaignId: campaign.id },
        select: ["id", "name", "type", "parentId"],
      }),
      npcRepo.count({
        where: { campaignId: campaign.id, gameSessionId: IsNull() },
      }),
    ]);
    if (npcCount > 0) return null;

    const locationIds = locations.map((location) => location.id);
    const connectionCount =
      locationIds.length > 0
        ? await connectionRepo.count({
            where: { fromLocationId: In(locationIds) },
          })
        : 0;
    if (connectionCount > 0) return null;

    const { hub, plaza } = this.resolveAnchors(campaign, locations);
    const tone =
      campaign.theme ??
      (campaign.tonalAnchor as { toneTags?: string[] } | undefined)
        ?.toneTags?.[0] ??
      null;

    const body = buildMinimalWorldSeedBody({
      seedKey: campaign.id,
      tone,
      hubName: hub?.name ?? null,
      plazaName: plaza?.name ?? null,
    });

    this.logger.log(
      `minimal_world_seed.apply campaignId=${campaign.id} hub=${
        hub?.name ?? "(novo)"
      } plaza=${plaza?.name ?? "(novo)"} locations=${locations.length} reason=empty_world`,
    );

    return this.worldSeedMaterializationService.materialize(campaign.id, body);
  }

  /**
   * Ancora o template no mundo existente: a hub é a starting location (ou a
   * melhor candidata por tipo) e a "praça" é a primeira filha da hub — assim
   * o upsert por nome ENRIQUECE as locations do fluxo solo ("Vila inicial" /
   * "Praça central") em vez de duplicá-las.
   */
  private resolveAnchors(
    campaign: CampaignEntity,
    locations: Array<Pick<LocationEntity, "id" | "name" | "type" | "parentId">>,
  ): {
    hub?: Pick<LocationEntity, "id" | "name" | "type" | "parentId">;
    plaza?: Pick<LocationEntity, "id" | "name" | "type" | "parentId">;
  } {
    if (locations.length === 0) return {};

    const byId = new Map(locations.map((location) => [location.id, location]));
    const starting = campaign.startingLocationId
      ? byId.get(campaign.startingLocationId)
      : undefined;

    if (starting?.parentId && byId.has(starting.parentId)) {
      // Starting aponta para uma sub-location (ex.: "Praça central"): a hub é
      // a mãe e a chegada é a própria starting.
      return { hub: byId.get(starting.parentId), plaza: starting };
    }

    const typePriority: Record<string, number> = {
      city: 1,
      district: 2,
      region: 3,
      building: 4,
      wilderness: 5,
    };
    const hub =
      starting ??
      [...locations].sort(
        (a, b) =>
          (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0) ||
          (typePriority[a.type ?? ""] ?? 9) - (typePriority[b.type ?? ""] ?? 9),
      )[0];
    const plaza = locations.find((location) => location.parentId === hub?.id);
    return { hub, plaza };
  }
}
