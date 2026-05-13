import {
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateIf,
} from "class-validator";
import { Type } from "class-transformer";


export class ResolveEncounterDto {
  @IsIn(["victory", "retreat", "negotiation", "defeat"])
  outcome: "victory" | "retreat" | "negotiation" | "defeat";

  @IsOptional()
  xpRewards?: any;

  @IsOptional()
  goldRewards?: any;

  @IsOptional()
  itemRewards?: any;
}
