import {
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

/**
 * Spec 003 T028/T029 — endpoint unificado para as 8 ações genéricas PHB.
 *
 * Discriminated union por `kind`. Validação de campos obrigatórios condicional
 * usa `@ValidateIf` em vez de `discriminator.subTypes` porque nem todos os
 * validators do class-validator suportam discriminator em arrays aninhados.
 *
 * Para novos `kind` adicionados futuramente (ex: 'custom' trigger em Ready),
 * estender este DTO — atualmente Ready aceita só dois triggers pré-definidos.
 */

export type GenericActionKind =
  | "dodge"
  | "dash"
  | "disengage"
  | "help"
  | "hide"
  | "ready"
  | "search"
  | "use-object";

export type ReadyTriggerKind = "enemy_enters_range" | "enemy_attacks_ally";

class ReadyTriggerDto {
  @IsIn(["enemy_enters_range", "enemy_attacks_ally"])
  kind: ReadyTriggerKind;

  // Requerido quando kind='enemy_enters_range'
  @ValidateIf((o) => o.kind === "enemy_enters_range")
  @IsInt()
  @Min(1)
  rangeFt?: number;

  // Requerido quando kind='enemy_attacks_ally'
  @ValidateIf((o) => o.kind === "enemy_attacks_ally")
  @IsUUID()
  allyParticipantId?: string;
}

/** Ação armada via Ready — para esta spec, cobrimos só ataques e movimentos
 * como ações preparadas. Spells fica pra spec futura (requer resolver de DC
 * + slot no momento do trigger). */
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
  } as const)
  kind: GenericActionKind;

  @IsUUID()
  participantId: string;

  // === Variante: help ===
  @ValidateIf((o: GenericActionDto) => o.kind === "help")
  @IsUUID()
  allyParticipantId?: string;

  @ValidateIf((o: GenericActionDto) => o.kind === "help")
  @IsUUID()
  targetParticipantId?: string;

  // === Variante: ready ===
  @ValidateIf((o: GenericActionDto) => o.kind === "ready")
  @ValidateNested()
  @Type(() => ReadyTriggerDto)
  trigger?: ReadyTriggerDto;

  @ValidateIf((o: GenericActionDto) => o.kind === "ready")
  @ValidateNested()
  @Type(() => ReadiedActionDescriptorDto)
  readiedAction?: ReadiedActionDescriptorDto;

  // === Variante: search ===
  @ValidateIf((o: GenericActionDto) => o.kind === "search")
  @IsIn(["perception", "investigation"])
  ability?: "perception" | "investigation";

  // === Variante: use-object ===
  @ValidateIf((o: GenericActionDto) => o.kind === "use-object")
  @ValidateNested()
  @Type(() => ObjectRefDto)
  objectRef?: ObjectRefDto;

  // Opcional: DM agindo em nome de outro (mesmo padrão do 002)
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  // Quando true, consome bonusActionUsed em vez de actionUsed.
  // Usado por features tipo Cunning Action (Rogue) e Nimble Escape (Goblin).
  @IsOptional()
  asBonusAction?: boolean;

  // Opcional: hack pra silenciar lint de "unused property" em variantes que
  // não usam — os decorators acima fazem a validação condicional real.
  @IsOptional()
  @IsNumber()
  _reserved?: never;
}
