import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";



export type GenericActionKind =
  | "dodge"
  | "dash"
  | "disengage"
  | "help"
  | "hide"
  | "ready"
  | "search"
  | "use-object"
  | "escape-web"
  | "flee-fear"
  | "wake-hypnotized";

export type ReadyTriggerKind = "enemy_enters_range" | "enemy_attacks_ally";

class ReadyTriggerDto {
  @IsIn(["enemy_enters_range", "enemy_attacks_ally"])
  kind: ReadyTriggerKind;


  @ValidateIf((o) => o.kind === "enemy_enters_range")
  @IsInt()
  @Min(1)
  rangeFt?: number;


  @ValidateIf((o) => o.kind === "enemy_attacks_ally")
  @IsUUID()
  allyParticipantId?: string;
}


class ReadiedActionDescriptorDto {
  @IsIn(["attack", "move"])
  kind: "attack" | "move";

  @ValidateIf((o) => o.kind === "attack")
  @IsString()
  actionName?: string;

  @ValidateIf((o) => o.kind === "attack")
  @IsOptional()
  targetParticipantIds?: string[];

  @ValidateIf((o) => o.kind === "move")
  @IsOptional()
  to?: { x: number; y: number };
}

class ObjectRefDto {
  @IsIn(["inventory", "environment"])
  source: "inventory" | "environment";

  @IsString()
  slug: string;

  @IsOptional()
  @IsUUID()
  itemId?: string;
}

export class GenericActionDto {
  @IsEnum({
    dodge: "dodge",
    dash: "dash",
    disengage: "disengage",
    help: "help",
    hide: "hide",
    ready: "ready",
    search: "search",
    "use-object": "use-object",
    "escape-web": "escape-web",
    "flee-fear": "flee-fear",
    "wake-hypnotized": "wake-hypnotized",
  } as const)
  kind: GenericActionKind;

  @IsUUID()
  participantId: string;

  @IsOptional()
  @IsBoolean()
  useHasteAction?: boolean;

  @ValidateIf((o: GenericActionDto) => o.kind === "help")
  @IsUUID()
  allyParticipantId?: string;

  @ValidateIf(
    (o: GenericActionDto) =>
      ["help", "wake-hypnotized"].includes(o.kind) ||
      (o.kind === "use-object" && o.targetParticipantId != null),
  )
  @IsUUID()
  targetParticipantId?: string;


  @ValidateIf((o: GenericActionDto) => o.kind === "ready")
  @ValidateNested()
  @Type(() => ReadyTriggerDto)
  trigger?: ReadyTriggerDto;

  @ValidateIf((o: GenericActionDto) => o.kind === "ready")
  @ValidateNested()
  @Type(() => ReadiedActionDescriptorDto)
  readiedAction?: ReadiedActionDescriptorDto;


  @ValidateIf((o: GenericActionDto) => o.kind === "search")
  @IsIn(["perception", "investigation"])
  ability?: "perception" | "investigation";

  @IsOptional()
  @IsIn(["sight", "hearing", "other"])
  searchSense?: "sight" | "hearing" | "other";


  @ValidateIf((o: GenericActionDto) => o.kind === "use-object")
  @ValidateNested()
  @Type(() => ObjectRefDto)
  objectRef?: ObjectRefDto;


  @IsOptional()
  @IsUUID()
  ownerUserId?: string;



  @IsOptional()
  @IsBoolean()
  asBonusAction?: boolean;



  @IsOptional()
  @IsNumber()
  _reserved?: never;
}
