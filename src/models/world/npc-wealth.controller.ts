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


@UseGuards(AuthGuard)
@Controller("sessions/:sessionId/npc-state/:stateId")
export class NpcWealthController {
  constructor(private readonly wealthService: NpcWealthService) {}


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


  @Post("add-item-to-treasure")
  async addItemToTreasure(
    @Param("stateId") stateId: string,
    @Body() body: AddItemToTreasureBody,
  ) {
    await this.wealthService.addItemToNpcTreasure(stateId, body.item);
    return { ok: true };
  }
}
