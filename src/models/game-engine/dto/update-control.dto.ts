import { IsIn } from "class-validator";


export class UpdateControlDto {
  @IsIn(["pc", "ai", "dm", "human"])
  mode: "pc" | "ai" | "dm" | "human";
}
