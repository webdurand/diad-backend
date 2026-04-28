/**
 * Metadata por error code — httpStatus, defaultTitle (en-US estável), defaultHint (PT-BR).
 * Source of truth: contracts/error-codes-catalog.json.
 */

import { ErrorCode } from "./error-codes.catalog";

export interface ErrorCodeMetadata {
  httpStatus: number;
  defaultTitle: string;
  defaultHint?: string;
  domain: string;
}

export const ERROR_CODE_METADATA: Record<ErrorCode, ErrorCodeMetadata> = {
  // auth
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

  // agent
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

  // campaign
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

  // session
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

  // combat
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

  // character
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

  // spell
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

  // validation
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

  // system
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

  // event bus (spec 017)
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

  // world / ambiance (spec 019)
  [ErrorCode.WEATHER_INVALID_BIOME]: {
    httpStatus: 422,
    defaultTitle: "Invalid biome",
    defaultHint:
      "Biomes válidos: forest, plains, mountain, swamp, desert.",
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

  // tool surface completion (spec 020)
  [ErrorCode.ENCOUNTER_CREATE_FAILED]: {
    httpStatus: 422,
    defaultTitle: "Failed to create encounter from narrative",
    defaultHint:
      "Verificar se a cena ainda existe e se os NPCs alvos estão na mesma localização.",
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
    defaultHint: "Verificar se o item já foi consumido/removido em turn anterior.",
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

  // session-recap (spec 024)
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
    defaultHint: "Payload do summarize inválido. Verifique sessionId + messages[].",
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
};

export function getMetadata(code: ErrorCode): ErrorCodeMetadata {
  return ERROR_CODE_METADATA[code];
}
