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

export type GameErrorCode =
  | 'NOT_YOUR_TURN'
  | 'INVALID_TARGET'
  | 'OUT_OF_RANGE'
  | 'NO_ACTION_AVAILABLE'
  | 'INSUFFICIENT_SPELL_SLOTS'
  | 'ALREADY_CONCENTRATING'
  | 'TARGET_DEFEATED'
  | 'ENCOUNTER_NOT_ACTIVE'
  | 'ENCOUNTER_NOT_PREPARING'
  | 'INVALID_PARTICIPANT'
  | 'CONDITION_PREVENTS_ACTION'
  | 'INVALID_ACTION'
  | 'SESSION_NOT_FOUND'
  | 'ENCOUNTER_NOT_FOUND'
  | 'PARTICIPANT_NOT_FOUND';

export interface GameEventData {
  event_type: string;
  actor_participant_id?: string;
  target_participant_id?: string;
  data: Record<string, any>;
}

export function success<T>(value: T, events: GameEventData[] = []): GameSuccess<T> {
  return { ok: true, value, events };
}

export function failure(error: string, code: GameErrorCode): GameFailure {
  return { ok: false, error, code };
}
