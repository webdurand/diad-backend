

import { ErrorCode } from "./error-codes.catalog";

export interface ErrorCodeMetadata {
  httpStatus: number;
  defaultTitle: string;
  defaultHint?: string;
  domain: string;
}

export const ERROR_CODE_METADATA: Record<ErrorCode, ErrorCodeMetadata> = {

  [ErrorCode.AUTH_TOKEN_MISSING]: {
    httpStatus: 401,
    defaultTitle: "Authentication token missing",
    defaultHint: "Faça login para continuar.",
    domain: "auth",
  },
  [ErrorCode.AUTH_TOKEN_INVALID]: {
    httpStatus: 401,
    defaultTitle: "Authentication token invalid",
    defaultHint: "Sua sessão é inválida — faça login novamente.",
    domain: "auth",
  },
  [ErrorCode.AUTH_TOKEN_EXPIRED]: {
    httpStatus: 401,
    defaultTitle: "Authentication token expired",
    defaultHint: "Sua sessão expirou — faça login novamente.",
    domain: "auth",
  },
  [ErrorCode.AUTH_PERMISSION_DENIED]: {
    httpStatus: 403,
    defaultTitle: "Permission denied",
    defaultHint: "Você não tem permissão para esta ação.",
    domain: "auth",
  },


  [ErrorCode.AGENT_UPSTREAM_ERROR]: {
    httpStatus: 502,
    defaultTitle: "Upstream agent service failed",
    defaultHint: "Tente novamente em alguns instantes.",
    domain: "agent",
  },
  [ErrorCode.AGENT_TIMEOUT]: {
    httpStatus: 504,
    defaultTitle: "Agent service timeout",
    defaultHint: "O agente demorou demais — tente novamente.",
    domain: "agent",
  },
  [ErrorCode.AGENT_UNREACHABLE]: {
    httpStatus: 502,
    defaultTitle: "Agent service unreachable",
    defaultHint: "Serviço de IA temporariamente indisponível.",
    domain: "agent",
  },
  [ErrorCode.AGENT_SESSION_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Agent session not found",
    defaultHint: "Sessão do agente expirada — recarregue a página.",
    domain: "agent",
  },
  [ErrorCode.AGENT_INVALID_RESPONSE]: {
    httpStatus: 502,
    defaultTitle: "Agent returned invalid response",
    defaultHint: "Resposta do agente em formato inesperado.",
    domain: "agent",
  },


  [ErrorCode.CAMPAIGN_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Campaign not found",
    defaultHint: "Campanha não encontrada.",
    domain: "campaign",
  },
  [ErrorCode.CAMPAIGN_PLAYER_LIMIT_REACHED]: {
    httpStatus: 409,
    defaultTitle: "Campaign player limit reached",
    defaultHint: "Esta campanha atingiu o limite de jogadores.",
    domain: "campaign",
  },
  [ErrorCode.CAMPAIGN_FORBIDDEN]: {
    httpStatus: 403,
    defaultTitle: "Campaign access forbidden",
    defaultHint: "Você não tem acesso a esta campanha.",
    domain: "campaign",
  },


  [ErrorCode.SESSION_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Session not found",
    defaultHint: "Sessão não encontrada.",
    domain: "session",
  },
  [ErrorCode.SESSION_NOT_JOINABLE]: {
    httpStatus: 409,
    defaultTitle: "Session not joinable",
    defaultHint: "Esta sessão não está aceitando novos jogadores.",
    domain: "session",
  },
  [ErrorCode.SESSION_DIALOGUE_NOT_ACTIVE]: {
    httpStatus: 409,
    defaultTitle: "Dialogue is not active",
    defaultHint: "Inicie uma conversa antes de usar ações de diálogo.",
    domain: "session",
  },
  [ErrorCode.SESSION_SOCIAL_COLLECTIVE_REQUIRED]: {
    httpStatus: 409,
    defaultTitle: "Scene is not a social collective",
    defaultHint:
      "Troca de interlocutor só vale em diálogo coletivo com múltiplos NPCs.",
    domain: "session",
  },
  [ErrorCode.SESSION_BIMODAL_LOOP_DISABLED]: {
    httpStatus: 409,
    defaultTitle: "Bimodal loop disabled",
    defaultHint:
      "A sessão precisa habilitar config.bimodalLoopEnabled para usar esse fluxo.",
    domain: "session",
  },
  [ErrorCode.NARRATIVE_TURN_NOT_ALLOWED_IN_IDLE_OPEN]: {
    httpStatus: 422,
    defaultTitle: "Narrative turn not allowed in idle open mode",
    defaultHint:
      "O jogo está aguardando uma ação explícita do jogador.",
    domain: "narrative",
  },
  [ErrorCode.NARRATIVE_TURN_SYSTEM_HINT_DEPRECATED]: {
    httpStatus: 410,
    defaultTitle: "Deprecated systemHint received",
    defaultHint:
      "Atualize o cliente para usar transition_dialogue_greeting.",
    domain: "narrative",
  },
  [ErrorCode.NARRATIVE_TURN_SYSTEM_HINT_LEGACY_ALIAS]: {
    httpStatus: 200,
    defaultTitle: "Legacy systemHint received and aliased",
    defaultHint:
      "Cliente legado aceito temporariamente; atualize para o systemHint canônico.",
    domain: "narrative",
  },
  [ErrorCode.NARRATIVE_TRANSITION_SCOPE_INVALID]: {
    httpStatus: 400,
    defaultTitle: "Invalid transitionScope value",
    defaultHint:
      "transitionScope deve ser greeting, arrival, departure, close, post_event, ambient ou none.",
    domain: "narrative",
  },


  [ErrorCode.COMBAT_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Combat not found",
    defaultHint: "Encontro de combate não encontrado.",
    domain: "combat",
  },
  [ErrorCode.COMBAT_TURN_INVALID]: {
    httpStatus: 409,
    defaultTitle: "Combat turn invalid",
    defaultHint: "Não é o seu turno.",
    domain: "combat",
  },
  [ErrorCode.COMBAT_PARTICIPANT_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Combat participant not found",
    defaultHint: "Participante do combate não encontrado.",
    domain: "combat",
  },


  [ErrorCode.CHARACTER_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Character not found",
    defaultHint: "Personagem não encontrado.",
    domain: "character",
  },
  [ErrorCode.CHARACTER_FORBIDDEN]: {
    httpStatus: 403,
    defaultTitle: "Character access forbidden",
    defaultHint: "Você não tem acesso a este personagem.",
    domain: "character",
  },


  [ErrorCode.SPELL_SLOT_UNAVAILABLE]: {
    httpStatus: 409,
    defaultTitle: "Spell slot unavailable",
    defaultHint: "Sem slots disponíveis para esta magia.",
    domain: "spell",
  },
  [ErrorCode.SPELL_NOT_PREPARED]: {
    httpStatus: 409,
    defaultTitle: "Spell not prepared",
    defaultHint: "Esta magia não está preparada.",
    domain: "spell",
  },


  [ErrorCode.VALIDATION_INVALID_PAYLOAD]: {
    httpStatus: 400,
    defaultTitle: "Validation failed",
    defaultHint: "Verifique os campos e tente novamente.",
    domain: "validation",
  },
  [ErrorCode.VALIDATION_MISSING_FIELD]: {
    httpStatus: 422,
    defaultTitle: "Missing required field",
    defaultHint: "Preencha todos os campos obrigatórios.",
    domain: "validation",
  },


  [ErrorCode.SYSTEM_INTERNAL_ERROR]: {
    httpStatus: 500,
    defaultTitle: "Internal server error",
    defaultHint: "Erro inesperado — tente novamente em instantes.",
    domain: "system",
  },
  [ErrorCode.SYSTEM_UNAVAILABLE]: {
    httpStatus: 503,
    defaultTitle: "Service unavailable",
    defaultHint: "Serviço temporariamente indisponível.",
    domain: "system",
  },
  [ErrorCode.SYSTEM_RATE_LIMITED]: {
    httpStatus: 429,
    defaultTitle: "Too many requests",
    defaultHint: "Aguarde alguns instantes antes de tentar novamente.",
    domain: "system",
  },
  [ErrorCode.UNKNOWN_ERROR]: {
    httpStatus: 500,
    defaultTitle: "Unknown error",
    defaultHint: "Erro desconhecido.",
    domain: "system",
  },


  [ErrorCode.EVENT_TYPE_NOT_REGISTERED]: {
    httpStatus: 422,
    defaultTitle: "Event type not registered",
    defaultHint:
      "Adicione este eventType ao catálogo (event-categories.json) antes de emitir.",
    domain: "event-bus",
  },
  [ErrorCode.TRACE_ID_INVALID]: {
    httpStatus: 400,
    defaultTitle: "Trace id invalid",
    defaultHint:
      "O header traceparent precisa seguir o formato W3C 00-{32hex}-{16hex}-{2hex}.",
    domain: "event-bus",
  },


  [ErrorCode.WEATHER_INVALID_BIOME]: {
    httpStatus: 422,
    defaultTitle: "Invalid biome",
    defaultHint: "Biomes válidos: forest, plains, mountain, swamp, desert.",
    domain: "world",
  },
  [ErrorCode.CLOCK_NEGATIVE_HOURS]: {
    httpStatus: 422,
    defaultTitle: "Invalid clock advance",
    defaultHint: "hours deve ser positivo (>0) e ≤ 168 (1 semana).",
    domain: "world",
  },
  [ErrorCode.CHAOS_OUT_OF_RANGE]: {
    httpStatus: 422,
    defaultTitle: "Chaos factor out of range",
    defaultHint: "chaosFactor deve ser inteiro entre 1 e 9 (Mythic GME).",
    domain: "world",
  },
  [ErrorCode.SPELL_BLOCKED_DEAD_MAGIC]: {
    httpStatus: 409,
    defaultTitle: "Spell blocked by dead magic",
    defaultHint:
      "Dead magic zone bloqueia spells de nível 1+; cantrips exigem ability check DC 11.",
    domain: "spell",
  },


  [ErrorCode.ENCOUNTER_CREATE_FAILED]: {
    httpStatus: 422,
    defaultTitle: "Failed to create encounter from narrative",
    defaultHint:
      "Verificar se a cena ainda existe e se os NPCs alvos estão na mesma localização.",
    domain: "encounter",
  },
  [ErrorCode.ENCOUNTER_NO_TARGETS_IN_SCENE]: {
    httpStatus: 422,
    defaultTitle: "No targets identified in current scene",
    defaultHint:
      "Nenhum oponente foi identificado na cena. Descreva quem você ataca via free-text.",
    domain: "encounter",
  },
  [ErrorCode.REVIVIFY_INELIGIBLE]: {
    httpStatus: 422,
    defaultTitle: "Revivify not applicable",
    defaultHint:
      "Janela RAW é 1 minuto desde a morte. Diamante de 300gp consumido como componente. Corpo precisa estar intacto.",
    domain: "spell",
  },
  [ErrorCode.REVIVIFY_TARGET_NOT_DEAD]: {
    httpStatus: 409,
    defaultTitle: "Revivify target is not dead",
    defaultHint:
      "Use Spare the Dying ou Healing Word se ainda está estabilizando.",
    domain: "spell",
  },
  [ErrorCode.REVIVIFY_BODY_DESTROYED]: {
    httpStatus: 422,
    defaultTitle: "Body destroyed prevents Revivify",
    defaultHint:
      "Necessário Resurrection ou True Resurrection para corpo destruído.",
    domain: "spell",
  },
  [ErrorCode.CONDITION_INVALID_SLUG]: {
    httpStatus: 400,
    defaultTitle: "Invalid condition slug",
    defaultHint:
      "Condições válidas: blinded, charmed, deafened, frightened, grappled, incapacitated, invisible, paralyzed, petrified, poisoned, prone, restrained, stunned, unconscious, exhaustion.",
    domain: "combat",
  },
  [ErrorCode.CONDITION_TARGET_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Condition target not found",
    defaultHint: "Verifique target_type (pc | npc) e que o id existe.",
    domain: "combat",
  },
  [ErrorCode.CONDITION_DURATION_INVALID]: {
    httpStatus: 400,
    defaultTitle: "Invalid condition duration hint",
    defaultHint:
      "Use: instant, 1_minute, 10_minutes, 1_hour, 24_hours, until_long_rest, until_cured.",
    domain: "combat",
  },
  [ErrorCode.EXHAUSTION_LEVELS_REQUIRED]: {
    httpStatus: 400,
    defaultTitle: "Exhaustion levels required",
    defaultHint: "Exhaustion exige campo exhaustion_levels (1-6, RAW 2024).",
    domain: "combat",
  },
  [ErrorCode.CONDITION_BLOCKED_BY_IMMUNITY]: {
    httpStatus: 200,
    defaultTitle: "Condition blocked by immunity",
    defaultHint:
      "Alvo é imune via feature/feat/spell — narrar resistência em vez de aplicar.",
    domain: "combat",
  },
  [ErrorCode.INVENTORY_ITEM_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Item not found in inventory",
    defaultHint:
      "Verificar se o item já foi consumido/removido em turn anterior.",
    domain: "inventory",
  },
  [ErrorCode.ITEM_OWNERSHIP_MISMATCH]: {
    httpStatus: 403,
    defaultTitle: "Item belongs to a different character",
    defaultHint: "Use o character_id correto do dono do item.",
    domain: "inventory",
  },
  [ErrorCode.CURRENCY_NEGATIVE_FORBIDDEN]: {
    httpStatus: 422,
    defaultTitle: "Currency balance cannot be negative",
    defaultHint:
      "DM pode forçar via narrativa diferente (ex: PC tomou empréstimo) — modelar como evento próprio.",
    domain: "inventory",
  },
  [ErrorCode.CURRENCY_DELTA_EMPTY]: {
    httpStatus: 400,
    defaultTitle: "At least one currency delta is required",
    defaultHint: "Pelo menos um de delta_cp/sp/gp/pp deve ser não-zero.",
    domain: "inventory",
  },
  [ErrorCode.NPC_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "NPC not found",
    defaultHint: "Verificar se o NPC ainda existe nessa campanha.",
    domain: "npc",
  },
  [ErrorCode.NPC_FOCAL_NOT_IN_SCENE]: {
    httpStatus: 422,
    defaultTitle: "Focal NPC is not in scene",
    defaultHint: "Escolha um NPC presente na cena atual.",
    domain: "npc",
  },
  [ErrorCode.NPC_LOCATION_MISMATCH]: {
    httpStatus: 422,
    defaultTitle: "NPC cannot move to target location",
    defaultHint: "Verificar getConnections para validar movimento.",
    domain: "npc",
  },
  [ErrorCode.NPC_DUPLICATE_NAME]: {
    httpStatus: 409,
    defaultTitle: "Duplicate NPC name in campaign",
    defaultHint:
      "Reusar NPC existente em vez de criar duplicado (Princípio bounded world).",
    domain: "npc",
  },
  [ErrorCode.ROLE_HINT_INVALID]: {
    httpStatus: 400,
    defaultTitle: "Invalid role hint",
    defaultHint:
      "Use: commoner, guard, merchant, scholar, criminal, innkeeper, noble, child, elder, soldier.",
    domain: "npc",
  },
  [ErrorCode.LOCATION_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Location not found",
    defaultHint: "Verificar se a localização ainda existe na campanha.",
    domain: "world",
  },
  [ErrorCode.LOCATION_CONNECTION_BLOCKED]: {
    httpStatus: 400,
    defaultTitle: "Location connection blocked",
    defaultHint:
      "Não há rota direta entre a location atual e o destino. Director deve narrar obstáculo ou revelar caminho.",
    domain: "world",
  },
  [ErrorCode.LOCATION_REQUIREMENTS_NOT_MET]: {
    httpStatus: 400,
    defaultTitle: "Location connection requirements not met",
    defaultHint:
      "Conexão é locked e requirements não atendidos (key, spell, etc). Director deve narrar obstáculo.",
    domain: "world",
  },
  [ErrorCode.PHASE_GATE_PENDING_CONFIRMATION]: {
    httpStatus: 409,
    defaultTitle: "Phase advance requires explicit confirmation",
    defaultHint:
      "Re-envie POST com body { confirmed: true } para confirmar; ou ignore para continuar na fase atual.",
    domain: "world",
  },
  [ErrorCode.COLD_OPEN_NO_ARCHETYPE_MATCH]: {
    httpStatus: 422,
    defaultTitle: "No cold open archetype matched",
    defaultHint:
      "Verifique perfis de voz, tags de personagem e arquétipos ativos antes de iniciar a primeira cena.",
    domain: "narrative",
  },
  [ErrorCode.COLD_OPEN_SLOT_RESOLUTION_FAILED]: {
    httpStatus: 422,
    defaultTitle: "Cold open slot resolution failed",
    defaultHint:
      "O arquétipo selecionado exige slots que não existem no contexto da cena.",
    domain: "narrative",
  },
  [ErrorCode.COLD_OPEN_GENERATION_TIMEOUT]: {
    httpStatus: 504,
    defaultTitle: "Cold open generation timed out",
    defaultHint:
      "A abertura cinemática foi pulada para preservar o início da sessão.",
    domain: "narrative",
  },
  [ErrorCode.META_QUERY_RATE_LIMIT_EXCEEDED]: {
    httpStatus: 429,
    defaultTitle: "Meta-query limit exceeded",
    defaultHint: "Cada cena permite até 3 perguntas meta.",
    domain: "narrative",
  },
  [ErrorCode.META_QUERY_KNOWLEDGE_SCOPE_VIOLATION]: {
    httpStatus: 422,
    defaultTitle: "Meta-query asks for omniscient knowledge",
    defaultHint:
      "Pergunte sobre tática, percepção, lembrança do personagem ou regra RAW; não sobre segredos ou números ocultos.",
    domain: "narrative",
  },
  [ErrorCode.SCENE_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Scene not found",
    defaultHint: "Cena pode ter sido encerrada — chamar get_active_scene.",
    domain: "session",
  },
  [ErrorCode.NPC_NOT_HOSTILE_CAPABLE]: {
    httpStatus: 422,
    defaultTitle: "NPC cannot enter combat",
    defaultHint:
      "NPC sem monsterId não tem stats. Use create_npc_from_narrative para aplicar default por role_hint.",
    domain: "encounter",
  },
  [ErrorCode.PARTICIPANT_PLACEMENT_FAILED]: {
    httpStatus: 500,
    defaultTitle: "Auto token placement failed",
    defaultHint:
      "Tentar com auto_place_tokens=false e chamar place_tokens manualmente.",
    domain: "encounter",
  },
  [ErrorCode.LOOT_TABLE_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Loot table not found",
    defaultHint: "Verificar slug ou usar cr_band para gerar tabela ad-hoc.",
    domain: "loot",
  },
  [ErrorCode.LOOT_ALREADY_ROLLED]: {
    httpStatus: 409,
    defaultTitle: "Loot table already rolled",
    defaultHint:
      "Tabelas DIAD são single-shot. Para loot recorrente, criar nova LootTableEntity ou usar cr_band ad-hoc.",
    domain: "loot",
  },
  [ErrorCode.LOOT_PARAMS_INVALID]: {
    httpStatus: 400,
    defaultTitle: "Invalid loot roll parameters",
    defaultHint:
      "Esperado exatamente um de: table_slug, cr_band+hoard_or_individual, monster_slug.",
    domain: "loot",
  },
  [ErrorCode.MONSTER_HAS_NO_LOOT]: {
    httpStatus: 404,
    defaultTitle: "Monster has no canonical loot",
    defaultHint: "Use cr_band para gerar loot ad-hoc.",
    domain: "loot",
  },
  [ErrorCode.MONSTER_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Monster not found",
    defaultHint: "Verifique se o slug do monstro existe no catálogo SRD.",
    domain: "encounter",
  },
  [ErrorCode.RANDOM_ENCOUNTER_POOL_EMPTY]: {
    httpStatus: 422,
    defaultTitle: "No eligible monsters for random encounter",
    defaultHint:
      "Pool vazio após filtros — tente outro bioma ou difficulty mais baixa.",
    domain: "encounter",
  },
  [ErrorCode.RANDOM_ENCOUNTER_INVALID_LOCATION]: {
    httpStatus: 400,
    defaultTitle: "Location type does not support random encounter",
    defaultHint: "Random encounters só em wilderness, dungeon ou dungeon_room.",
    domain: "encounter",
  },
  [ErrorCode.PARTICIPANT_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Participant not found",
    defaultHint: "Verificar se o participant ainda existe no encounter.",
    domain: "encounter",
  },
  [ErrorCode.DYING_STATE_TRANSITION_INVALID]: {
    httpStatus: 422,
    defaultTitle: "Dying state transition not allowed",
    defaultHint:
      "Transições válidas: none↔dying, dying→stable, dying→dead, stable→none (com HP+), stable→dying (novo dano), * → captured (extensão DIAD).",
    domain: "encounter",
  },
  [ErrorCode.DYING_STATE_REQUIRES_HP_RESTORE]: {
    httpStatus: 422,
    defaultTitle: "Stable to none requires HP restore",
    defaultHint:
      "RAW: stable mantém 0HP. Apply healing antes de transicionar para none.",
    domain: "encounter",
  },


  [ErrorCode.SUMMARIZE_LLM_TIMEOUT]: {
    httpStatus: 504,
    defaultTitle: "Hot-recap LLM call timed out",
    defaultHint:
      "Recap pendente — agendado retry. Próximo turn ainda continua via recent messages + scene context.",
    domain: "session-recap",
  },
  [ErrorCode.SUMMARIZE_LLM_FAILURE]: {
    httpStatus: 502,
    defaultTitle: "Hot-recap LLM call failed",
    defaultHint:
      "Recap não pôde ser gerado neste momento — agendado retry. Continuidade da cena imediata mantida via recent messages.",
    domain: "session-recap",
  },
  [ErrorCode.SUMMARIZE_INVALID_INPUT]: {
    httpStatus: 400,
    defaultTitle: "Invalid input for hot-recap",
    defaultHint:
      "Payload do summarize inválido. Verifique sessionId + messages[].",
    domain: "session-recap",
  },
  [ErrorCode.SUMMARIZE_AUTH_FAILED]: {
    httpStatus: 401,
    defaultTitle: "Internal token missing or invalid",
    defaultHint:
      "Endpoint /internal/summarize exige X-Internal-Token compartilhado entre backend e agents.",
    domain: "session-recap",
  },
  [ErrorCode.SESSION_LAST_MESSAGE_MISMATCH]: {
    httpStatus: 409,
    defaultTitle: "Frontend lastMessageId does not match server state",
    defaultHint:
      "Re-hidrate o histórico — algum turno foi processado fora desta aba.",
    domain: "session-recap",
  },


  [ErrorCode.IDEMPOTENCY_CACHE_MISS_AFTER_RACE]: {
    httpStatus: 409,
    defaultTitle: "Idempotency cache missed after concurrent race",
    defaultHint:
      "Outro turn com a mesma chave foi processado em paralelo — re-hidrate o histórico antes de tentar de novo.",
    domain: "session",
  },
  [ErrorCode.NARRATIVE_DECISION_AFFECTED_ENTITY_NOT_FOUND]: {
    httpStatus: 422,
    defaultTitle: "NarrativeDecision.affectedEntity could not be resolved",
    defaultHint:
      "O Archivist enviou um nome em vez de UUID, e nenhuma entidade casa com esse nome no contexto da campanha.",
    domain: "narrative",
  },
  [ErrorCode.CAMPAIGN_SLUG_NOT_RESOLVED]: {
    httpStatus: 404,
    defaultTitle: "Campaign slug or id could not be resolved",
    defaultHint:
      "Verifique se a campanha existe e se o slug/UUID na URL está correto.",
    domain: "campaign",
  },
  [ErrorCode.LEGACY_ENDPOINT_DEPRECATED]: {
    httpStatus: 410,
    defaultTitle: "Legacy endpoint removed",
    defaultHint:
      "Use /ai/narrative/:sessionId/turn — endpoints /solo/* foram removidos na spec 027.",
    domain: "system",
  },
  [ErrorCode.NARRATIVE_REACHABLE_LOCATIONS_SESSION_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Reachable locations session not found",
    defaultHint: "Recarregue a sessão antes de listar destinos.",
    domain: "narrative",
  },
  [ErrorCode.NARRATIVE_REACHABLE_LOCATIONS_NO_ACTIVE_SCENE]: {
    httpStatus: 409,
    defaultTitle: "No active scene for reachable locations",
    defaultHint: "Abra uma cena com location antes de viajar.",
    domain: "narrative",
  },
  [ErrorCode.SCENE_POI_OBSERVATION_GEN_FAILED]: {
    httpStatus: 502,
    defaultTitle: "Scene POI observation generation failed",
    defaultHint: "Mostre apenas a descrição canônica do POI e tente de novo depois.",
    domain: "scene",
  },
  [ErrorCode.SCENE_POI_OBSERVATION_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "Scene POI observation not found",
    defaultHint: "Recarregue o hub do local.",
    domain: "scene",
  },
  [ErrorCode.SCENE_POI_OBSERVATION_INVALID_POI]: {
    httpStatus: 422,
    defaultTitle: "Invalid POI for scene observation",
    defaultHint: "Use um POI conhecido da sessão atual.",
    domain: "scene",
  },
  [ErrorCode.DIALOGUE_SKILL_ROLL_CAP_EXCEEDED]: {
    httpStatus: 422,
    defaultTitle: "Dialogue skill roll cap exceeded",
    defaultHint: "Guarda de ritmo DIAD: use fala livre ou encerre o turno.",
    domain: "dialogue",
  },
  [ErrorCode.DIALOGUE_REVEAL_FAILED]: {
    httpStatus: 500,
    defaultTitle: "Dialogue reveal failed",
    defaultHint: "Tente pressionar por mais em outro momento.",
    domain: "dialogue",
  },
  [ErrorCode.DIALOGUE_REVEAL_NOT_AVAILABLE]: {
    httpStatus: 409,
    defaultTitle: "Dialogue reveal not available",
    defaultHint: "Este NPC não tem algo novo para revelar agora.",
    domain: "dialogue",
  },
  [ErrorCode.TRAVEL_ACTION_NO_ACTIVE_TRAVEL]: {
    httpStatus: 409,
    defaultTitle: "No active travel",
    defaultHint: "Inicie uma viagem antes de usar ações de viagem.",
    domain: "travel",
  },
  [ErrorCode.TRAVEL_ACTION_INVALID_KIND]: {
    httpStatus: 422,
    defaultTitle: "Invalid travel action kind",
    defaultHint: "Use hasten, camp, scout ou reroute.",
    domain: "travel",
  },
  [ErrorCode.TRAVEL_ACTION_RATIONS_REQUIRED]: {
    httpStatus: 422,
    defaultTitle: "Rations required",
    defaultHint: "Você precisa de pelo menos 1 ração para acelerar.",
    domain: "travel",
  },
  [ErrorCode.TRAVEL_ACTION_INSUFFICIENT_RATIONS]: {
    httpStatus: 422,
    defaultTitle: "Insufficient rations",
    defaultHint: "Você precisa de pelo menos 1 ração para acelerar.",
    domain: "travel",
  },
  [ErrorCode.TRAVEL_ACTION_EXHAUSTION_CAP]: {
    httpStatus: 422,
    defaultTitle: "Exhaustion cap reached",
    defaultHint:
      "Guarda de ritmo DIAD: exhaustion nível 6 é morte em ambas edições.",
    domain: "travel",
  },
  [ErrorCode.TRAVEL_ACTION_UNSAFE_LONG_REST]: {
    httpStatus: 422,
    defaultTitle: "Unsafe long rest",
    defaultHint: "Procure área segura ou resolva a ameaça antes do long rest.",
    domain: "travel",
  },
  [ErrorCode.TRAVEL_ACTION_ROUTE_INVALID]: {
    httpStatus: 422,
    defaultTitle: "Invalid route",
    defaultHint: "Escolha uma rota conhecida e acessível.",
    domain: "travel",
  },
  [ErrorCode.TRAVEL_ACTION_INVALID_REROUTE]: {
    httpStatus: 422,
    defaultTitle: "Invalid reroute",
    defaultHint: "Escolha uma rota alternativa conhecida e acessível.",
    domain: "travel",
  },
  [ErrorCode.TRAVEL_ACTION_DISABLED_BY_FLAG]: {
    httpStatus: 409,
    defaultTitle: "Travel action disabled",
    defaultHint: "Ative hubPoiEnabled na sessão antes de usar ações de viagem.",
    domain: "travel",
  },
  [ErrorCode.TRAVEL_ACTION_GUARD_FAILED]: {
    httpStatus: 422,
    defaultTitle: "Travel guard failed",
    defaultHint: "A ação de viagem não atende aos requisitos atuais.",
    domain: "travel",
  },

  [ErrorCode.ADMIN_METRICS_PERIOD_INVALID]: {
    httpStatus: 400,
    defaultTitle: "Invalid metrics period",
    defaultHint:
      "Use period entre 1d e 365d, ou intervalo from/to ISO-8601 válido.",
    domain: "admin",
  },
  [ErrorCode.ADMIN_METRICS_FILTER_INVALID]: {
    httpStatus: 400,
    defaultTitle: "Invalid metrics filter",
    defaultHint:
      "Filtros aceitos: model, agentRole, featureName, userId. Verifique formato.",
    domain: "admin",
  },
  [ErrorCode.ADMIN_METRICS_USER_NOT_FOUND]: {
    httpStatus: 404,
    defaultTitle: "User not found for metrics filter",
    defaultHint: "O userId informado não existe no sistema.",
    domain: "admin",
  },
  [ErrorCode.ADMIN_METRICS_EXPORT_LIMIT_EXCEEDED]: {
    httpStatus: 422,
    defaultTitle: "Export row limit exceeded",
    defaultHint:
      "Export máximo é 10.000 linhas — restrinja período/filtros e tente de novo.",
    domain: "admin",
  },
};

export function getMetadata(code: ErrorCode): ErrorCodeMetadata {
  return ERROR_CODE_METADATA[code];
}
