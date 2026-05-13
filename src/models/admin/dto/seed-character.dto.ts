import { Type } from "class-transformer";
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
} from "class-validator";

const SUPPORTED_CLASS_SLUGS = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
] as const;

export type SupportedClassSlug = (typeof SUPPORTED_CLASS_SLUGS)[number];

const SUPPORTED_LEVELS = [1, 3, 9, 10, 11, 13, 15, 20] as const;
export type SupportedLevel = (typeof SUPPORTED_LEVELS)[number];

const SUPPORTED_SEED_MODES = ["spell-lab"] as const;
export type SupportedSeedMode = (typeof SUPPORTED_SEED_MODES)[number];

const SUPPORTED_SPELL_LOADOUTS = [
  "all-class-spells",
  "all-ready-spells",
] as const;
export type SupportedSpellLoadout = (typeof SUPPORTED_SPELL_LOADOUTS)[number];


export class SeedCharacterDto {
  @IsIn(SUPPORTED_CLASS_SLUGS as unknown as string[])
  classSlug!: SupportedClassSlug;

  @IsString()
  subclassSlug!: string;

  @IsInt()
  @IsIn(SUPPORTED_LEVELS as unknown as number[])
  level!: SupportedLevel;

  @IsIn(["XPHB"])
  edition!: "XPHB";


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

  @IsOptional()
  @IsIn(SUPPORTED_SEED_MODES as unknown as string[])
  seedMode?: SupportedSeedMode;

  @IsOptional()
  @IsIn(SUPPORTED_SPELL_LOADOUTS as unknown as string[])
  spellLoadout?: SupportedSpellLoadout;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  weaponMasteryChoices?: string[];


  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalEquipmentSlugs?: string[];


  @IsOptional()
  @IsString()
  fightingStyleSlug?: string;


  @IsOptional()
  @IsString()
  mainHandSlug?: string;

  @IsOptional()
  @IsString()
  offHandSlug?: string;
}
