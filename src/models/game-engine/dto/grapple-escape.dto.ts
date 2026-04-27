import { IsIn, IsUUID } from "class-validator";

export class GrappleEscapeDto {
  @IsUUID()
  participantId: string;

  @IsIn(["athletics", "acrobatics"])
  ability: "athletics" | "acrobatics";
}
