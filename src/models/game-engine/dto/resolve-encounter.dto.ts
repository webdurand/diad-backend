import {
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Spec 007 — DTO para POST /encounters/:id/resolve.
 *
 * Aceita dois shapes:
 * - Simplificado: { mode, value } para XP; { cp, sp, gp, pp } para gold
 * - Legacy: arrays per-character
 *
 * O service normaliza ambos para o formato interno via normalizeResolvePayload().
 * Validação de shape é feita manualmente no service (duck-typing),
 * não via class-validator, porque discriminated unions com campos heterogêneos
 * (number | Record | Array) não se encaixam bem no class-validator.
 *
 * O DTO valida apenas o campo obrigatório (outcome) e aceita o resto como any
 * para que o ValidationPipe não rejeite shapes válidos.
 */
export class ResolveEncounterDto {
  @IsIn(['victory', 'retreat', 'negotiation', 'defeat'])
  outcome: 'victory' | 'retreat' | 'negotiation' | 'defeat';

  @IsOptional()
  xpRewards?: any;

  @IsOptional()
  goldRewards?: any;

  @IsOptional()
  itemRewards?: any;
}
