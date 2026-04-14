import { IsIn } from 'class-validator';

/**
 * Spec 003 T061 — DTO para `PATCH /participants/:pid/control`.
 * Apenas DM da sessão pode mudar; enforcement no EncounterService.
 */
export class UpdateControlDto {
  @IsIn(['human', 'ai', 'dm'])
  mode: 'human' | 'ai' | 'dm';
}
