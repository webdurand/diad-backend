import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

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
}
