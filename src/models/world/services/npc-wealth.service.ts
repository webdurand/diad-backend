import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { CharacterStateEntity } from "src/entities/character-state.entity";
import { SessionNpcStateEntity } from "src/entities/session-npc-state.entity";

export interface CurrencyDelta {
  cp?: number;
  sp?: number;
  gp?: number;
  pp?: number;
}

export interface TreasureItem {
  itemId: string;
  name: string;
  quantity: number;
  value_gp?: number;
}

export type ParticipantKind = "npc" | "pc";

export interface ParticipantRef {
  kind: ParticipantKind;

  id: string;
}

export interface CurrencyTransferOp {
  type: "currency";
  from: ParticipantRef;
  to: ParticipantRef;
  amount: CurrencyDelta;
  reason: string;
}

export interface ItemTransferOp {
  type: "item";
  from: ParticipantRef;
  to: ParticipantRef;
  itemId: string;
  quantity: number;
  reason: string;
}

export type TransferOp = CurrencyTransferOp | ItemTransferOp;

export interface TransferResult {
  ok: true;
  ops: TransferOp[];

  states: Array<{
    kind: ParticipantKind;
    id: string;
    currency: { cp: number; sp: number; gp: number; pp: number };
  }>;
}


@Injectable()
export class NpcWealthService {
  private readonly logger = new Logger(NpcWealthService.name);

  constructor(
    @InjectRepository(SessionNpcStateEntity)
    private readonly npcStateRepo: Repository<SessionNpcStateEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly charStateRepo: Repository<CharacterStateEntity>,
    private readonly dataSource: DataSource,
  ) {}



  private static normalizeAmount(amount: CurrencyDelta): {
    cp: number;
    sp: number;
    gp: number;
    pp: number;
  } {
    return {
      cp: Math.floor(amount.cp ?? 0),
      sp: Math.floor(amount.sp ?? 0),
      gp: Math.floor(amount.gp ?? 0),
      pp: Math.floor(amount.pp ?? 0),
    };
  }

  private static totalAmount(amount: CurrencyDelta): number {
    return (
      Math.abs(amount.cp ?? 0) +
      Math.abs(amount.sp ?? 0) +
      Math.abs(amount.gp ?? 0) +
      Math.abs(amount.pp ?? 0)
    );
  }

  private async loadParticipantCurrency(
    manager: EntityManager,
    ref: ParticipantRef,
  ): Promise<{ cp: number; sp: number; gp: number; pp: number }> {
    if (ref.kind === "npc") {
      const npcState = await manager.findOne(SessionNpcStateEntity, {
        where: { id: ref.id },
      });
      if (!npcState) {
        throw new NotFoundException(`SessionNpcState ${ref.id} não encontrado`);
      }
      return { ...npcState.currency };
    }
    const charState = await manager.findOne(CharacterStateEntity, {
      where: { character: { id: ref.id } } as any,
      relations: { character: true },
    });
    if (!charState) {
      throw new NotFoundException(`Character ${ref.id} sem state`);
    }
    return {
      cp: charState.cp ?? 0,
      sp: charState.sp ?? 0,
      gp: charState.gp ?? 0,
      pp: charState.pp ?? 0,
    };
  }

  private async writeParticipantCurrency(
    manager: EntityManager,
    ref: ParticipantRef,
    next: { cp: number; sp: number; gp: number; pp: number },
  ): Promise<void> {
    if (ref.kind === "npc") {
      await manager.update(SessionNpcStateEntity, ref.id, { currency: next });
      return;
    }
    const charState = await manager.findOne(CharacterStateEntity, {
      where: { character: { id: ref.id } } as any,
      relations: { character: true },
    });
    if (!charState) {
      throw new NotFoundException(`Character ${ref.id} sem state`);
    }
    charState.cp = next.cp;
    charState.sp = next.sp;
    charState.gp = next.gp;
    charState.pp = next.pp;
    await manager.save(charState);
  }




  async transferCurrency(op: CurrencyTransferOp): Promise<TransferResult> {
    if (NpcWealthService.totalAmount(op.amount) <= 0) {
      throw new BadRequestException({
        code: "CURRENCY_DELTA_EMPTY",
        message: "amount precisa ter pelo menos uma denominação não-zero.",
      });
    }
    return this.dataSource.transaction(async (manager) => {
      return this.applyCurrencyTransferTx(manager, op);
    });
  }

  private async applyCurrencyTransferTx(
    manager: EntityManager,
    op: CurrencyTransferOp,
  ): Promise<TransferResult> {
    const amount = NpcWealthService.normalizeAmount(op.amount);
    const fromBalance = await this.loadParticipantCurrency(manager, op.from);
    const toBalance = await this.loadParticipantCurrency(manager, op.to);


    for (const denom of ["cp", "sp", "gp", "pp"] as const) {
      if (amount[denom] <= 0) continue;
      if (fromBalance[denom] < amount[denom]) {
        throw new BadRequestException({
          code: "INSUFFICIENT_FUNDS",
          message: `${op.from.kind}=${op.from.id} não tem ${amount[denom]}${denom} (tem ${fromBalance[denom]}${denom}).`,
          context: {
            denom,
            requested: amount[denom],
            available: fromBalance[denom],
          },
        });
      }
    }

    const nextFrom = {
      cp: fromBalance.cp - amount.cp,
      sp: fromBalance.sp - amount.sp,
      gp: fromBalance.gp - amount.gp,
      pp: fromBalance.pp - amount.pp,
    };
    const nextTo = {
      cp: toBalance.cp + amount.cp,
      sp: toBalance.sp + amount.sp,
      gp: toBalance.gp + amount.gp,
      pp: toBalance.pp + amount.pp,
    };

    await this.writeParticipantCurrency(manager, op.from, nextFrom);
    await this.writeParticipantCurrency(manager, op.to, nextTo);

    this.logger.log({
      event: "npc_wealth.currency_transferred",
      from: op.from,
      to: op.to,
      amount,
      reason: op.reason,
    });

    return {
      ok: true,
      ops: [op],
      states: [
        { kind: op.from.kind, id: op.from.id, currency: nextFrom },
        { kind: op.to.kind, id: op.to.id, currency: nextTo },
      ],
    };
  }




  async transferItemFromNpcTreasure(
    sessionNpcStateId: string,
    itemId: string,
    quantity: number,
  ): Promise<TreasureItem> {
    if (quantity <= 0) {
      throw new BadRequestException({
        code: "INVALID_QUANTITY",
        message: "quantity deve ser > 0",
      });
    }
    return this.dataSource.transaction(async (manager) => {
      const npcState = await manager.findOne(SessionNpcStateEntity, {
        where: { id: sessionNpcStateId },
      });
      if (!npcState) {
        throw new NotFoundException(
          `SessionNpcState ${sessionNpcStateId} não encontrado`,
        );
      }
      const treasure = npcState.treasure ?? [];
      const idx = treasure.findIndex((t) => t.itemId === itemId);
      if (idx < 0) {
        throw new BadRequestException({
          code: "ITEM_NOT_AVAILABLE",
          message: `NPC ${sessionNpcStateId} não tem item ${itemId}.`,
        });
      }
      if (treasure[idx].quantity < quantity) {
        throw new BadRequestException({
          code: "ITEM_QUANTITY_INSUFFICIENT",
          message: `NPC tem ${treasure[idx].quantity}× ${itemId}, solicitado ${quantity}.`,
          context: {
            itemId,
            available: treasure[idx].quantity,
            requested: quantity,
          },
        });
      }

      const removed: TreasureItem = {
        itemId: treasure[idx].itemId,
        name: treasure[idx].name,
        quantity,
        value_gp: treasure[idx].value_gp,
      };
      const newQty = treasure[idx].quantity - quantity;
      if (newQty === 0) {
        treasure.splice(idx, 1);
      } else {
        treasure[idx] = { ...treasure[idx], quantity: newQty };
      }
      await manager.update(SessionNpcStateEntity, sessionNpcStateId, {
        treasure,
      });

      this.logger.log({
        event: "npc_wealth.item_removed_from_treasure",
        sessionNpcStateId,
        itemId,
        quantity,
      });
      return removed;
    });
  }


  async addItemToNpcTreasure(
    sessionNpcStateId: string,
    item: TreasureItem,
  ): Promise<void> {
    if (item.quantity <= 0) {
      throw new BadRequestException({
        code: "INVALID_QUANTITY",
        message: "quantity deve ser > 0",
      });
    }
    await this.dataSource.transaction(async (manager) => {
      const npcState = await manager.findOne(SessionNpcStateEntity, {
        where: { id: sessionNpcStateId },
      });
      if (!npcState) {
        throw new NotFoundException(
          `SessionNpcState ${sessionNpcStateId} não encontrado`,
        );
      }
      const treasure = npcState.treasure ?? [];
      const idx = treasure.findIndex((t) => t.itemId === item.itemId);
      if (idx >= 0) {
        treasure[idx] = {
          ...treasure[idx],
          quantity: treasure[idx].quantity + item.quantity,
        };
      } else {
        treasure.push({ ...item });
      }
      await manager.update(SessionNpcStateEntity, sessionNpcStateId, {
        treasure,
      });
    });
  }


  async tradeAtomic(ops: TransferOp[]): Promise<TransferResult> {
    if (!ops || ops.length === 0) {
      throw new BadRequestException({
        code: "EMPTY_TRADE",
        message: "tradeAtomic requer ≥1 op",
      });
    }
    return this.dataSource.transaction(async (manager) => {
      const results: TransferResult["states"] = [];
      for (const op of ops) {
        if (op.type === "currency") {
          const r = await this.applyCurrencyTransferTx(manager, op);
          results.push(...r.states);
        } else {


          if (op.from.kind === "npc") {
            const removed = await manager.findOne(SessionNpcStateEntity, {
              where: { id: op.from.id },
            });
            if (!removed) {
              throw new NotFoundException(
                `SessionNpcState ${op.from.id} não encontrado`,
              );
            }
            const treasure = removed.treasure ?? [];
            const idx = treasure.findIndex((t) => t.itemId === op.itemId);
            if (idx < 0 || treasure[idx].quantity < op.quantity) {
              throw new BadRequestException({
                code: "ITEM_NOT_AVAILABLE",
                message: `NPC ${op.from.id} sem item ${op.itemId} qty ${op.quantity}.`,
              });
            }
            const newQty = treasure[idx].quantity - op.quantity;
            if (newQty === 0) treasure.splice(idx, 1);
            else treasure[idx] = { ...treasure[idx], quantity: newQty };
            await manager.update(SessionNpcStateEntity, op.from.id, {
              treasure,
            });
          }
          if (op.to.kind === "npc") {
            const target = await manager.findOne(SessionNpcStateEntity, {
              where: { id: op.to.id },
            });
            if (!target) {
              throw new NotFoundException(
                `SessionNpcState ${op.to.id} não encontrado`,
              );
            }
            const treasure = target.treasure ?? [];
            const idx = treasure.findIndex((t) => t.itemId === op.itemId);
            if (idx >= 0) {
              treasure[idx] = {
                ...treasure[idx],
                quantity: treasure[idx].quantity + op.quantity,
              };
            } else {
              treasure.push({
                itemId: op.itemId,
                name: op.itemId,
                quantity: op.quantity,
              });
            }
            await manager.update(SessionNpcStateEntity, op.to.id, {
              treasure,
            });
          }
        }
      }
      return { ok: true, ops, states: results };
    });
  }
}
