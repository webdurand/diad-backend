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
};

export function getMetadata(code: ErrorCode): ErrorCodeMetadata {
  return ERROR_CODE_METADATA[code];
}
