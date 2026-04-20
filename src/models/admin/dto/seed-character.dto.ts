import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SUPPORTED_CLASS_SLUGS = [
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'warlock',
  'wizard',
] as const;

export type SupportedClassSlug = (typeof SUPPORTED_CLASS_SLUGS)[number];

export const SUPPORTED_LEVELS = [1, 10, 20] as const;
export type SupportedLevel = (typeof SUPPORTED_LEVELS)[number];

/**
 * Payload do `POST /admin/seed-character` (spec 012).
 *
 * Materializa um PC canônico para o harness de validação. Defaults por classe
 * são deterministicos (standard array 15/14/13/12/10/8 alocado pela ability
 * primária). Caller pode sobrescrever via `abilityArray` ou `name`.
 */
export class SeedCharacterDto {
  @IsIn(SUPPORTED_CLASS_SLUGS as unknown as string[])
  classSlug!: SupportedClassSlug;

  @IsString()
  subclassSlug!: string;

  @IsInt()
  @IsIn(SUPPORTED_LEVELS as unknown as number[])
  level!: SupportedLevel;

  @IsIn(['XPHB'])
  edition!: 'XPHB';

  /**
   * [STR, DEX, CON, INT, WIS, CHA]. Se omitido, standard array alocado pela
   * ability primária da classe.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(6)
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(3, { each: true })
  @Max(20, { each: true })
  abilityArray?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  /**
   * Spec 012 Fase 0 — armas (slugs) que o personagem domina (weapon_mastery_choices).
   * Só tem efeito em classes com weapon_mastery_count > 0 (Barbarian, Fighter, Monk,
   * Paladin, Ranger, Rogue). Undefined/empty → sem mastery disponível.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  weaponMasteryChoices?: string[];
}
