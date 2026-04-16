import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Spec 007 — query params para GET /library/:entity.
 *
 * Paginação: limit (default 50, max 200) + offset (default 0).
 * Filtros genéricos: source (estrito), name (ILIKE).
 * Filtros por entity: cr (monsters), level/school/class (spells), category (equipment).
 */
export class LibraryQueryDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  name?: string;

  /** Monsters only: CR range "0-5" or exact "3" */
  @IsOptional()
  @IsString()
  cr?: string;

  /** Monsters only: creature type */
  @IsOptional()
  @IsString()
  type?: string;

  /** Spells only: spell level */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  level?: number;

  /** Spells only: school name (ILIKE) */
  @IsOptional()
  @IsString()
  school?: string;

  /** Spells only: class name (ILIKE) */
  @IsOptional()
  @IsString()
  class?: string;

  /** Equipment only: category name (ILIKE) */
  @IsOptional()
  @IsString()
  category?: string;
}
