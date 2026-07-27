import { IsUUID } from "class-validator";

export class AarakocraRitualActionDto {
  @IsUUID()
  participantId!: string;
}
