import { IsIn } from "class-validator";

/**
 * Spec 006 — DTO para `PATCH /participants/:pid/control`.
 * Aceita 'pc', 'ai', 'dm'. 'human' aceito como alias deprecated para 'pc'.
 * Apenas DM da sessão pode mudar; enforcement no EncounterService.
 */
export class UpdateControlDto {
  @IsIn(["pc", "ai", "dm", "human"])
  mode: "pc" | "ai" | "dm" | "human";
}
