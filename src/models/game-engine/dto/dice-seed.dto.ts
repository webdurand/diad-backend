import { IsInt, Max, Min } from "class-validator";

/**
 * Payload do endpoint `POST /game/dice/seed`.
 * Seed 32-bit unsigned aceito pelo mulberry32 do DiceService.
 */
export class DiceSeedDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  value!: number;
}
