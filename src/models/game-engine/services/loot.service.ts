import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LootTableEntity } from 'src/entities/loot-table.entity';
import { LootTableItemEntity } from 'src/entities/loot-table-item.entity';
import { DiceService } from './dice.service';
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from '../interfaces/result.type';

export interface LootItem {
  equipmentId?: string;
  magicItemId?: string;
  name: string;
  quantity: number;
}

export interface LootResult {
  lootTableId: string;
  lootTableName: string;
  items: LootItem[];
}

@Injectable()
export class LootService {
  constructor(
    @InjectRepository(LootTableEntity)
    private readonly lootTableRepo: Repository<LootTableEntity>,
    @InjectRepository(LootTableItemEntity)
    private readonly lootItemRepo: Repository<LootTableItemEntity>,
    private readonly diceService: DiceService,
  ) {}

  async rollLoot(lootTableId: string): Promise<GameResult<LootResult>> {
    const table = await this.lootTableRepo.findOne({
      where: { id: lootTableId },
      relations: ['items', 'items.equipment', 'items.magicItem'],
    });

    if (!table) {
      return failure('Loot table nao encontrada.', 'ENCOUNTER_NOT_FOUND');
    }

    if (table.isLooted) {
      return failure('Este tesouro ja foi saqueado.', 'INVALID_ACTION');
    }

    const droppedItems: LootItem[] = [];
    const items = table.items ?? [];

    for (const item of items) {
      // Roll drop chance
      const roll = Math.random();
      if (roll > item.dropChance) continue;

      const name =
        item.equipment?.name ??
        item.magicItem?.name ??
        'Item desconhecido';

      droppedItems.push({
        equipmentId: item.equipmentId ?? undefined,
        magicItemId: item.magicItemId ?? undefined,
        name,
        quantity: item.quantity,
      });
    }

    // Mark as looted
    await this.lootTableRepo.update(lootTableId, { isLooted: true });

    const events: GameEventData[] = droppedItems.map((item) => ({
      event_type: 'loot_dropped',
      data: {
        loot_table_id: lootTableId,
        item_name: item.name,
        quantity: item.quantity,
      },
    }));

    return success(
      { lootTableId, lootTableName: table.name, items: droppedItems },
      events,
    );
  }

  async getLootTable(lootTableId: string): Promise<LootTableEntity | null> {
    return this.lootTableRepo.findOne({
      where: { id: lootTableId },
      relations: ['items', 'items.equipment', 'items.magicItem'],
    });
  }

  async getLootTablesForLocation(locationId: string): Promise<LootTableEntity[]> {
    return this.lootTableRepo.find({
      where: { locationId, isLooted: false },
      relations: ['items', 'items.equipment', 'items.magicItem'],
    });
  }
}
