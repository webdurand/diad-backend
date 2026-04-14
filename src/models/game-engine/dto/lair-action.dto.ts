import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

export class LairActionDto {
  @IsUUID()
  monsterParticipantId: string;

  /** null = skip; senão índice em monster.lair_actions */
  @ValidateIf((o) => o.actionIndex !== null)
  @IsInt()
  @Min(0)
  actionIndex: number | null;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  targetParticipantIds?: string[];
}
