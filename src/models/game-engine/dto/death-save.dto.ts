import { IsOptional, IsUUID } from "class-validator";


export class DeathSaveDto {
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}
