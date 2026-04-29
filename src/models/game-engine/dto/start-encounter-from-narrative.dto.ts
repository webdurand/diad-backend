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

/**
 * Spec 026 Pillar 4 — sugestão de layout vinda do agente narrativo
 * (PreFlightOracle). `ref` é characterId (PC) OU npcId; backend resolve
 * pra participantId após criação. Coords são em células (0-indexed) e
 * validadas contra o gridSize do encounter; entradas inválidas são
 * descartadas silenciosamente — o fallback auto-grid cobre os faltantes.
 */
export class TokenLayoutEntryDto {
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

/**
 * Spec 020 — POST /game/sessions/:sessionId/encounters/from-narrative.
 *
 * Body do orquestrador narrativa→combate. Campos:
 *  - sceneId: cena ativa (FK SceneEntity); 404 SCENE_NOT_FOUND se inválida.
 *  - attackerParticipantId: PC que disparou o ataque; null = setup-only.
 *  - targetNpcIds: NPCs que viram hostis (1..12). Cada um precisa monsterId.
 *  - surpriseRound: aplica Disadvantage on initiative (RAW 2024) + condition `surprised`.
 *  - autoPlaceTokens: posiciona tokens em grid top-left (default true).
 *  - narrativeTrigger: descritor PT-BR (≤200) virando o `name` do encounter.
 *  - campaignId: explícito; senão derivado da session.
 */
export class StartEncounterFromNarrativeDto {
  @IsUUID()
  sceneId: string;

  @IsOptional()
  @IsUUID()
  attackerParticipantId?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsUUID("all", { each: true })
  targetNpcIds: string[];

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

  /**
   * Spec 026 Pillar 4 — layout proposto pelo PreFlightOracle (agente narrativo)
   * mapeando refs (characterId/npcId) a coords no grid. Quando válido,
   * sobrescreve o auto-grid top-left. Refs ausentes ou coords fora do grid
   * são descartados sem erro — auto-grid preenche o resto.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TokenLayoutEntryDto)
  tokensLayout?: TokenLayoutEntryDto[];
}
