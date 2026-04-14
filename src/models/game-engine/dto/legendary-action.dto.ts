import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUUID } from 'class-validator';

export class LegendaryActionDto {
  @IsUUID()
  monsterParticipantId: string;

  @IsString()
  actionName: string;

  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  targetParticipantIds: string[];
}
