import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import {
  NpcWealthService,
  type CurrencyDelta,
  type TreasureItem,
} from "./services/npc-wealth.service";

interface TransferCurrencyBody {
  pcId: string;
  amount: CurrencyDelta;
  reason: string;
}

interface RemoveItemFromTreasureBody {
  itemId: string;
  quantity: number;
}

interface AddItemToTreasureBody {
  item: TreasureItem;
}

/**
 * Endpoints de wealth/treasure pra NPCs em sessão. Suporta theft, gift,
 * comércio. Atomicidade garantida via transactions no service.
 *
 * Item transfer NPC↔PC: backend só toca NPC side (treasure). PC side
 * (inventory) é orquestrado pelas tools no agents (chamam este endpoint
 * + /characters/:id/inventory). Não-atômico cross-side — aceitable
 * pra V1 (rollback manual via narrativa se uma das pernas falhar).
 *
 * Path scoping: por SessionNpcState id (não NPC canônico) — wealth é
 * estado de sessão, não atributo do NPC do mundo.
 */
@UseGuards(AuthGuard)
@Controller("sessions/:sessionId/npc-state/:stateId")
export class NpcWealthController {
  constructor(private readonly wealthService: NpcWealthService) {}

  /** NPC paga PC (recompensa, gift, oferta). */
  @Post("transfer-currency-to-pc")
  async transferCurrencyToPc(
    @Param("stateId") stateId: string,
    @Body() body: TransferCurrencyBody,
  ) {
    return this.wealthService.transferCurrency({
      type: "currency",
      from: { kind: "npc", id: stateId },
      to: { kind: "pc", id: body.pcId },
      amount: body.amount,
      reason: body.reason,
    });
  }

  /** PC paga NPC (compra, suborno, taxa). */
  @Post("transfer-currency-from-pc")
  async transferCurrencyFromPc(
    @Param("stateId") stateId: string,
    @Body() body: TransferCurrencyBody,
  ) {
    return this.wealthService.transferCurrency({
      type: "currency",
      from: { kind: "pc", id: body.pcId },
      to: { kind: "npc", id: stateId },
      amount: body.amount,
      reason: body.reason,
    });
  }

  /** Remove item do treasure NPC (PC roubou OU NPC presenteou).
   * Retorna o item removido pra caller adicionar ao PC inventory via
   * /characters/:id/inventory (orquestração no agent side). */
  @Post("remove-item-from-treasure")
  async removeItemFromTreasure(
    @Param("stateId") stateId: string,
    @Body() body: RemoveItemFromTreasureBody,
  ) {
    const removed = await this.wealthService.transferItemFromNpcTreasure(
      stateId,
      body.itemId,
      body.quantity,
    );
    return { ok: true, value: { removed } };
  }

  /** Adiciona item ao treasure NPC (PC deu, loot retornado, restock). */
  @Post("add-item-to-treasure")
  async addItemToTreasure(
    @Param("stateId") stateId: string,
    @Body() body: AddItemToTreasureBody,
  ) {
    await this.wealthService.addItemToNpcTreasure(stateId, body.item);
    return { ok: true };
  }
}
