/**
 * Spec 020 — roll_loot_table.
 *
 * Wrapper HTTP-friendly do LootService existente, com 3 modos:
 *   1. table_slug → puxa LootTableEntity por slug, single-shot (marca isLooted)
 *   2. cr_band → gera tabela transient ad-hoc (não persiste, não bloqueia rerolls)
 *   3. monster_slug → loot canônico do monstro (V1: ad-hoc por CR do monstro)
 *
 * Emite SocialEvent.loot_rolled (audience: HUD, CompanionAI, Narrator).
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LootTableEntity } from "src/entities/loot-table.entity";
import { LootService } from "./loot.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

export type CRBand = "cr_0_4" | "cr_5_10" | "cr_11_16" | "cr_17_plus";
export type LootMode = "individual" | "hoard";

export interface RollLootInput {
  campaignId: string;
  tableSlug?: string;
  crBand?: CRBand;
  monsterSlug?: string;
  hoardOrIndividual?: LootMode;
  awardToCharacterId?: string | null;
  traceId?: string;
}

export interface LootRollResult {
  lootTableId: string | null;
  items: Array<{
    name: string;
    quantity: number;
    equipmentId?: string;
    magicItemId?: string;
  }>;
  currency: { cp: number; sp: number; gp: number; pp: number };
  awarded: boolean;
}

const CR_BAND_GP_RANGES: Record<CRBand, [number, number]> = {
  cr_0_4: [0, 50],
  cr_5_10: [50, 500],
  cr_11_16: [500, 5000],
  cr_17_plus: [5000, 50000],
};

@Injectable()
export class LootRollService {
  constructor(
    @InjectRepository(LootTableEntity)
    private readonly tableRepo: Repository<LootTableEntity>,
    private readonly lootService: LootService,
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
  ) {}

  async roll(input: RollLootInput): Promise<LootRollResult> {
    this.validateMode(input);

    let result: LootRollResult;
    if (input.tableSlug) {
      result = await this.rollBySlug(input.tableSlug);
    } else if (input.crBand) {
      result = this.rollByCrBand(
        input.crBand,
        input.hoardOrIndividual ?? "individual",
      );
    } else if (input.monsterSlug) {
      result = await this.rollByMonster(input.monsterSlug);
    } else {
      throw new DomainException(
        ErrorCode.LOOT_PARAMS_INVALID,
        "Esperado um de: table_slug, cr_band, monster_slug.",
      );
    }

    result.awarded = !!input.awardToCharacterId;

    try {
      const envelope = this.factory.build({
        eventCategory: "SocialEvent",
        eventType: "loot_rolled",
        source: {
          service: "diad-backend",
          module: "LootRollService.roll",
          traceId: input.traceId,
        },
        scope: { campaignId: input.campaignId },
        payload: {
          lootTableId: result.lootTableId,
          items: result.items,
          currency: result.currency,
          awardedToCharacterId: input.awardToCharacterId ?? null,
        },
        narrativeDescriptor: this.descriptor(result),
      });
      await this.eventBus.publish(envelope);
    } catch {
      /* best-effort */
    }

    return result;
  }

  private validateMode(input: RollLootInput): void {
    const modes = [
      input.tableSlug ? 1 : 0,
      input.crBand ? 1 : 0,
      input.monsterSlug ? 1 : 0,
    ];
    const sum = modes.reduce((a, b) => a + b, 0);
    if (sum !== 1) {
      throw new DomainException(
        ErrorCode.LOOT_PARAMS_INVALID,
        "Use exatamente um de: table_slug, cr_band, monster_slug.",
      );
    }
  }

  private async rollBySlug(slug: string): Promise<LootRollResult> {
    // LootTableEntity uses `name` as the human-friendly identifier (no `slug` col).
    const table = await this.tableRepo.findOne({ where: { name: slug } });
    if (!table) {
      throw new DomainException(
        ErrorCode.LOOT_TABLE_NOT_FOUND,
        `Loot table '${slug}' não encontrada.`,
        { context: { slug } },
      );
    }
    if (table.isLooted) {
      throw new DomainException(
        ErrorCode.LOOT_ALREADY_ROLLED,
        `Loot table '${slug}' já foi saqueada.`,
        { context: { lootTableId: table.id } },
      );
    }
    const rolled = await this.lootService.rollLoot(table.id);
    if (!rolled.ok) {
      throw new DomainException(
        ErrorCode.LOOT_TABLE_NOT_FOUND,
        rolled.error ?? "Falha ao rolar loot.",
      );
    }
    return {
      lootTableId: table.id,
      items: rolled.value.items,
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      awarded: false,
    };
  }

  /**
   * Gera tabela transient por CR band — sem persistir, sem isLooted.
   * V1 simples: rola gp dentro da faixa + multiplicador 5x se hoard.
   */
  private rollByCrBand(band: CRBand, mode: LootMode): LootRollResult {
    const [min, max] = CR_BAND_GP_RANGES[band];
    const baseGp = Math.floor(Math.random() * (max - min + 1)) + min;
    const multiplier = mode === "hoard" ? 5 : 1;
    return {
      lootTableId: null,
      items: [],
      currency: { cp: 0, sp: 0, gp: baseGp * multiplier, pp: 0 },
      awarded: false,
    };
  }

  private async rollByMonster(monsterSlug: string): Promise<LootRollResult> {
    // V1: tabelas por monster_slug não existem como first-class entity.
    // Caller deve usar cr_band; retornar erro semântico.
    throw new DomainException(
      ErrorCode.MONSTER_HAS_NO_LOOT,
      `Monstro '${monsterSlug}' sem loot canônico. Use cr_band ad-hoc.`,
      { context: { monsterSlug } },
    );
  }

  private descriptor(result: LootRollResult): string {
    const parts: string[] = [];
    if (result.items.length > 0) {
      parts.push(`${result.items.length} item(ns)`);
    }
    if (result.currency.gp > 0) parts.push(`${result.currency.gp}gp`);
    if (parts.length === 0) return "Tesouro vazio.";
    return `Saqueado: ${parts.join(", ")}.`;
  }
}
