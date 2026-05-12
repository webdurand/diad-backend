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

import { Injectable, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LootTableEntity } from "src/entities/loot-table.entity";
import { LootService } from "./loot.service";
import {
  MagicItemSelectorService,
  PartyTier,
} from "./magic-item-selector.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

export type CRBand = "cr_0_4" | "cr_5_10" | "cr_11_16" | "cr_17_plus";
export type LootMode = "individual" | "hoard";
export type EncounterDifficulty =
  | "trivial"
  | "easy"
  | "medium"
  | "hard"
  | "deadly";

export interface RollLootInput {
  campaignId: string;
  tableSlug?: string;
  crBand?: CRBand;
  monsterSlug?: string;
  hoardOrIndividual?: LootMode;
  awardToCharacterId?: string | null;
  encounterDifficulty?: EncounterDifficulty;
  partyTier?: PartyTier;
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

const DIFFICULTY_GP_MULTIPLIER: Record<EncounterDifficulty, number> = {
  trivial: 0.5,
  easy: 0.75,
  medium: 1.0,
  hard: 1.5,
  deadly: 2.0,
};

const MAGIC_ITEM_DROP_CHANCE: Record<EncounterDifficulty, number> = {
  trivial: 0.0,
  easy: 0.05,
  medium: 0.1,
  hard: 0.2,
  deadly: 0.35,
};

const TIER_COIN_DISTRIBUTION: Record<
  PartyTier,
  { cp: number; sp: number; gp: number; pp: number }
> = {
  "1": { cp: 0.3, sp: 0.5, gp: 0.18, pp: 0.02 },
  "2": { cp: 0.05, sp: 0.25, gp: 0.65, pp: 0.05 },
  "3": { cp: 0.0, sp: 0.05, gp: 0.75, pp: 0.2 },
  "4": { cp: 0.0, sp: 0.0, gp: 0.6, pp: 0.4 },
};

@Injectable()
export class LootRollService {
  rng: () => number = Math.random;

  constructor(
    @InjectRepository(LootTableEntity)
    private readonly tableRepo: Repository<LootTableEntity>,
    private readonly lootService: LootService,
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
    @Optional() private readonly magicItemSelector?: MagicItemSelectorService,
  ) {}

  async roll(input: RollLootInput): Promise<LootRollResult> {
    this.validateMode(input);

    let result: LootRollResult;
    if (input.tableSlug) {
      result = await this.rollBySlug(input.tableSlug);
    } else if (input.crBand) {
      result = await this.rollByCrBand(
        input.crBand,
        input.hoardOrIndividual ?? "individual",
        input.encounterDifficulty,
        input.partyTier,
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

  private async rollByCrBand(
    band: CRBand,
    mode: LootMode,
    difficulty?: EncounterDifficulty,
    tier?: PartyTier,
  ): Promise<LootRollResult> {
    const [min, max] = CR_BAND_GP_RANGES[band];
    const baseGp = Math.floor(this.rng() * (max - min + 1)) + min;
    const hoardMultiplier = mode === "hoard" ? 5 : 1;
    const diffMultiplier = difficulty
      ? DIFFICULTY_GP_MULTIPLIER[difficulty]
      : 1.0;
    const totalGp = Math.floor(baseGp * hoardMultiplier * diffMultiplier);

    const currency = tier
      ? this.distributeCoinsByTier(totalGp, tier)
      : { cp: 0, sp: 0, gp: totalGp, pp: 0 };

    const items: LootRollResult["items"] = [];
    if (difficulty && tier && this.magicItemSelector) {
      const dropChance = MAGIC_ITEM_DROP_CHANCE[difficulty];
      if (this.rng() < dropChance) {
        const item = await this.magicItemSelector.pickByTier(tier);
        if (item) {
          items.push({
            name: item.name,
            quantity: 1,
            magicItemId: item.id,
          });
        }
      }
    }

    return {
      lootTableId: null,
      items,
      currency,
      awarded: false,
    };
  }

  private distributeCoinsByTier(
    totalGp: number,
    tier: PartyTier,
  ): { cp: number; sp: number; gp: number; pp: number } {
    const dist = TIER_COIN_DISTRIBUTION[tier];
    const totalCp = totalGp * 100;
    const cp = Math.floor(totalCp * dist.cp);
    const sp = Math.floor((totalCp * dist.sp) / 10);
    const gp = Math.floor((totalCp * dist.gp) / 100);
    const pp = Math.floor((totalCp * dist.pp) / 1000);
    return { cp, sp, gp, pp };
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
