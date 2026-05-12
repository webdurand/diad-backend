import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MagicItemEntity } from "src/entities/magic-item.entity";

export type PartyTier = "1" | "2" | "3" | "4";
export type MagicItemRarity =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "Very Rare"
  | "Legendary";

const TIER_LOOT_RARITY: Record<PartyTier, MagicItemRarity[]> = {
  "1": ["Common", "Uncommon"],
  "2": ["Common", "Uncommon", "Rare"],
  "3": ["Uncommon", "Rare", "Very Rare"],
  "4": ["Rare", "Very Rare", "Legendary"],
};

const RARITY_BASE_WEIGHT: Record<MagicItemRarity, number> = {
  Common: 0.5,
  Uncommon: 0.35,
  Rare: 0.12,
  "Very Rare": 0.025,
  Legendary: 0.005,
};

@Injectable()
export class MagicItemSelectorService {
  rng: () => number = Math.random;

  constructor(
    @InjectRepository(MagicItemEntity)
    private readonly repo: Repository<MagicItemEntity>,
  ) {}

  async pickByTier(tier: PartyTier): Promise<MagicItemEntity | null> {
    const eligibleRarities = TIER_LOOT_RARITY[tier];

    for (let attempt = 0; attempt < eligibleRarities.length; attempt++) {
      const rarity = this.pickRarity(eligibleRarities);
      const items = await this.repo.find({
        where: { rarity: { name: rarity } as never },
      });
      if (items.length > 0) {
        return items[Math.floor(this.rng() * items.length)];
      }
    }

    return null;
  }

  private pickRarity(eligible: MagicItemRarity[]): MagicItemRarity {
    const total = eligible.reduce((acc, r) => acc + RARITY_BASE_WEIGHT[r], 0);
    let r = this.rng() * total;
    for (const rarity of eligible) {
      r -= RARITY_BASE_WEIGHT[rarity];
      if (r <= 0) return rarity;
    }
    return eligible[eligible.length - 1];
  }
}
