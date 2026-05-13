import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";


class TokenLayoutEntryDto {
  @IsString()
  @MaxLength(100)
  ref: string;

  @IsInt()
  @Min(0)
  x: number;

  @IsInt()
  @Min(0)
  y: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reason?: string;
}


export class StartEncounterFromNarrativeDto {

  @IsOptional()
  @IsUUID()
  sceneId?: string;

  @IsOptional()
  @IsUUID()
  attackerParticipantId?: string | null;


  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsUUID("all", { each: true })
  targetNpcIds?: string[];


  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  targets?: string[];

  @IsOptional()
  @IsBoolean()
  surpriseRound?: boolean;

  @IsOptional()
  @IsBoolean()
  autoPlaceTokens?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  narrativeTrigger?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;


  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TokenLayoutEntryDto)
  tokensLayout?: TokenLayoutEntryDto[];
}
