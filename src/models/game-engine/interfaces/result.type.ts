/**
 * Result pattern for game engine operations.
 * Game logic never throws — it returns Success or Failure.
 */

export type GameResult<T> = GameSuccess<T> | GameFailure;

export interface GameSuccess<T> {
  ok: true;
  value: T;
  events: GameEventData[];
}

export interface GameFailure {
  ok: false;
  error: string;
  code: GameErrorCode;
}

/**
 * Catalog of canonical error codes used in the envelope `{ok:false, error, code}`.
 * See `specs/002-encounter-correctness/contracts/error-codes-catalog.md` for semantics.
 */
export enum GameErrorCode {
  // Generic validation and permissions
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  FORBIDDEN = 'FORBIDDEN',
  UNAUTHORIZED = 'UNAUTHORIZED',

  // Encounter lifecycle
  ENCOUNTER_NOT_FOUND = 'ENCOUNTER_NOT_FOUND',
  ENCOUNTER_NOT_ACTIVE = 'ENCOUNTER_NOT_ACTIVE',
  ENCOUNTER_NOT_PREPARING = 'ENCOUNTER_NOT_PREPARING',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',

  // Participants
  PARTICIPANT_NOT_FOUND = 'PARTICIPANT_NOT_FOUND',
  INVALID_PARTICIPANT = 'INVALID_PARTICIPANT',
  INVALID_TARGET = 'INVALID_TARGET',
  TARGET_DEFEATED = 'TARGET_DEFEATED',
  OUT_OF_RANGE = 'OUT_OF_RANGE',

  // Turn and action economy
  NOT_YOUR_TURN = 'NOT_YOUR_TURN',
  NO_ACTION_AVAILABLE = 'NO_ACTION_AVAILABLE',
  NO_BONUS_ACTION_AVAILABLE = 'NO_BONUS_ACTION_AVAILABLE',
  NO_REACTION_AVAILABLE = 'NO_REACTION_AVAILABLE',
  CONDITION_PREVENTS_ACTION = 'CONDITION_PREVENTS_ACTION',
  INVALID_ACTION = 'INVALID_ACTION',

  // Death saves (novos na spec 002)
  NOT_DYING = 'NOT_DYING',
  ALREADY_DEAD = 'ALREADY_DEAD',

  // Multiataque (novos na spec 002)
  INVALID_MULTIATTACK = 'INVALID_MULTIATTACK',
  MULTIATTACK_NOT_RECHARGED = 'MULTIATTACK_NOT_RECHARGED',

  // Magia
  INVALID_SPELL = 'INVALID_SPELL',
  INSUFFICIENT_SPELL_SLOTS = 'INSUFFICIENT_SPELL_SLOTS',
  ALREADY_CONCENTRATING = 'ALREADY_CONCENTRATING',
  NO_CONCENTRATION = 'NO_CONCENTRATION',

  // Movement
  POSITION_OUT_OF_BOUNDS = 'POSITION_OUT_OF_BOUNDS',
  POSITION_OCCUPIED = 'POSITION_OCCUPIED',
  OUT_OF_MOVEMENT = 'OUT_OF_MOVEMENT',

  // Spec 003: IA e ações genéricas
  NOT_AI_CONTROLLED = 'NOT_AI_CONTROLLED',
  AI_UNAVAILABLE = 'AI_UNAVAILABLE',
  AI_TIMEOUT = 'AI_TIMEOUT',
  NOT_DODGING = 'NOT_DODGING',
  NOT_HIDDEN = 'NOT_HIDDEN',
  INVALID_READY_TRIGGER = 'INVALID_READY_TRIGGER',
  ITEM_NOT_USABLE = 'ITEM_NOT_USABLE',
  CONTROL_CHANGE_FORBIDDEN = 'CONTROL_CHANGE_FORBIDDEN',

  // Spec 004: completude RAW
  INSUFFICIENT_LEGENDARY_POINTS = 'INSUFFICIENT_LEGENDARY_POINTS',
  CONDITION_PREVENTS_LEGENDARY = 'CONDITION_PREVENTS_LEGENDARY',
  LAIR_ACTION_NOT_AVAILABLE = 'LAIR_ACTION_NOT_AVAILABLE',
  NOT_GRAPPLED = 'NOT_GRAPPLED',
  RESISTANCE_NOT_APPLICABLE = 'RESISTANCE_NOT_APPLICABLE',
  CONCENTRATION_ALREADY_BROKEN = 'CONCENTRATION_ALREADY_BROKEN',
  INVALID_CONDITION_INSTANCE = 'INVALID_CONDITION_INSTANCE',
  PERSISTENT_AREA_NOT_FOUND = 'PERSISTENT_AREA_NOT_FOUND',
}

/**
 * Canonical PT-BR messages per code.
 * Source of truth for error text. Tests should assert on `code`, not message.
 */
export const ERROR_MESSAGES_PT_BR: Record<GameErrorCode, string> = {
  [GameErrorCode.INVALID_PAYLOAD]: 'Payload invalido.',
  [GameErrorCode.FORBIDDEN]: 'Voce nao tem permissao para esta operacao.',
  [GameErrorCode.UNAUTHORIZED]: 'Sessao ausente.',

  [GameErrorCode.ENCOUNTER_NOT_FOUND]: 'Encontro nao encontrado.',
  [GameErrorCode.ENCOUNTER_NOT_ACTIVE]: 'Encontro nao esta ativo.',
  [GameErrorCode.ENCOUNTER_NOT_PREPARING]: 'Encontro nao esta em preparacao.',
  [GameErrorCode.SESSION_NOT_FOUND]: 'Sessao nao encontrada.',

  [GameErrorCode.PARTICIPANT_NOT_FOUND]: 'Participante nao encontrado.',
  [GameErrorCode.INVALID_PARTICIPANT]: 'Participante invalido para esta operacao.',
  [GameErrorCode.INVALID_TARGET]: 'Alvo invalido.',
  [GameErrorCode.TARGET_DEFEATED]: 'Alvo ja esta derrotado.',
  [GameErrorCode.OUT_OF_RANGE]: 'Alvo fora de alcance.',

  [GameErrorCode.NOT_YOUR_TURN]: 'Nao e o turno deste participante.',
  [GameErrorCode.NO_ACTION_AVAILABLE]: 'Acao ja utilizada neste turno.',
  [GameErrorCode.NO_BONUS_ACTION_AVAILABLE]: 'Acao bonus ja utilizada neste turno.',
  [GameErrorCode.NO_REACTION_AVAILABLE]: 'Reacao ja utilizada neste round.',
  [GameErrorCode.CONDITION_PREVENTS_ACTION]: 'Uma condicao impede esta acao.',
  [GameErrorCode.INVALID_ACTION]: 'Acao invalida ou nao disponivel.',

  [GameErrorCode.NOT_DYING]: 'Este participante nao esta fazendo testes de morte.',
  [GameErrorCode.ALREADY_DEAD]: 'Este participante ja esta morto.',

  [GameErrorCode.INVALID_MULTIATTACK]: 'Multiataque invalido ou nao disponivel.',
  [GameErrorCode.MULTIATTACK_NOT_RECHARGED]: 'Multiataque ainda nao recarregou.',

  [GameErrorCode.INVALID_SPELL]: 'Magia nao encontrada ou nao disponivel para este caster.',
  [GameErrorCode.INSUFFICIENT_SPELL_SLOTS]: 'Sem slot de magia disponivel deste nivel.',
  [GameErrorCode.ALREADY_CONCENTRATING]: 'Ja ha uma magia de concentracao ativa.',
  [GameErrorCode.NO_CONCENTRATION]: 'Nenhuma concentracao ativa.',

  [GameErrorCode.POSITION_OUT_OF_BOUNDS]: 'Posicao fora dos limites do mapa.',
  [GameErrorCode.POSITION_OCCUPIED]: 'Posicao ja esta ocupada.',
  [GameErrorCode.OUT_OF_MOVEMENT]: 'Movimento insuficiente.',

  [GameErrorCode.NOT_AI_CONTROLLED]:
    'Este participante nao esta sob controle de IA.',
  [GameErrorCode.AI_UNAVAILABLE]:
    'O servico de IA esta indisponivel no momento.',
  [GameErrorCode.AI_TIMEOUT]:
    'A IA excedeu o tempo limite para decidir o turno.',
  [GameErrorCode.NOT_DODGING]: 'Este participante nao esta esquivando.',
  [GameErrorCode.NOT_HIDDEN]: 'Este participante nao esta escondido.',
  [GameErrorCode.INVALID_READY_TRIGGER]:
    'O gatilho da acao preparada e invalido.',
  [GameErrorCode.ITEM_NOT_USABLE]: 'Este item nao pode ser usado em combate.',
  [GameErrorCode.CONTROL_CHANGE_FORBIDDEN]:
    'Apenas o DM da sessao pode alterar o controle de um participante.',

  [GameErrorCode.INSUFFICIENT_LEGENDARY_POINTS]:
    'Pontos lendarios insuficientes para usar essa acao.',
  [GameErrorCode.CONDITION_PREVENTS_LEGENDARY]:
    'A criatura esta incapacitada e nao pode usar acoes lendarias.',
  [GameErrorCode.LAIR_ACTION_NOT_AVAILABLE]:
    'Lair actions nao estao disponiveis para este encontro.',
  [GameErrorCode.NOT_GRAPPLED]: 'O participante nao esta agarrado.',
  [GameErrorCode.RESISTANCE_NOT_APPLICABLE]:
    'Resistencia nao se aplica a este tipo de dano.',
  [GameErrorCode.CONCENTRATION_ALREADY_BROKEN]:
    'A concentracao ja foi quebrada.',
  [GameErrorCode.INVALID_CONDITION_INSTANCE]:
    'Instancia de condicao invalida.',
  [GameErrorCode.PERSISTENT_AREA_NOT_FOUND]:
    'Efeito de area persistente nao encontrado.',
};

export interface GameEventData {
  event_type: string;
  actor_participant_id?: string;
  target_participant_id?: string;
  data: Record<string, any>;
}

/**
 * Helper para resposta de sucesso.
 */
export function success<T>(value: T, events: GameEventData[] = []): GameSuccess<T> {
  return { ok: true, value, events };
}

/**
 * Helper para resposta de falha.
 * Aceita (code) - mensagem vem do catálogo PT-BR.
 * Ou (message, code) - mensagem customizada.
 *
 * O segundo parâmetro aceita `GameErrorCode` ou string (porque os valores do
 * enum são strings idênticas aos códigos canônicos). Isso mantém backwards
 * compatibility com call sites que passam literais antes de migrar pro enum.
 */
export function failure(
  codeOrMessage: GameErrorCode | string,
  code?: GameErrorCode | string,
): GameFailure {
  if (code === undefined) {
    const c = codeOrMessage as GameErrorCode;
    return { ok: false, error: ERROR_MESSAGES_PT_BR[c] ?? String(c), code: c };
  }
  return { ok: false, error: String(codeOrMessage), code: code as GameErrorCode };
}
