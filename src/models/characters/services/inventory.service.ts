import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CharacterEntity,
  CharacterEquipmentEntity,
  CharacterMagicItemEntity,
  CharacterStateEntity,
  CharacterAbilityScoreEntity,
  EquipmentEntity,
  MagicItemEntity,
} from "src/entities";
import { EquipmentSourceEnum } from "src/entities/enums";
import { CharacterStateService } from "./character-state.service";
import { ensureCharacterOwnership } from "src/shared/character-guard";

// ---- DTOs ----

export interface AddItemDto {
  equipmentId: string;
  quantity?: number;
  source?: EquipmentSourceEnum;
}

export interface UpdateItemDto {
  quantity: number;
}

export interface GoldUpdateDto {
  cp?: number;
  sp?: number;
  gp?: number;
  pp?: number;
}

export interface EquipToggleDto {
  equipped: boolean;
}

export type HandSlot = "main" | "off" | null;

export interface SetHandDto {
  /** 'main' = empunha em main hand; 'off' = em off-hand; null = guarda (stow) */
  hand: HandSlot;
}

export interface AttuneToggleDto {
  attuned: boolean;
}

export interface AddMagicItemDto {
  magicItemId: string;
}

export interface UseItemResult {
  consumed: boolean;
  remainingQuantity: number;
  effect?: {
    type: string;
    healingApplied?: number;
    newCurrentHp?: number;
    maxHp?: number;
    message: string;
  };
}

// ---- Response types ----

export interface InventoryItemResponse {
  id: string;
  equipment: {
    id: string;
    slug: string;
    name: string;
    weight: number;
    cost: Record<string, unknown>;
    damage?: Record<string, unknown>;
    armorClass?: Record<string, unknown>;
    properties?: Record<string, unknown>;
    range?: Record<string, unknown>;
    description?: string;
  };
  quantity: number;
  equipped: boolean;
  mainHand: boolean;
  offHand: boolean;
  source: string;
}

export interface MagicItemInventoryResponse {
  id: string;
  magicItem: {
    id: string;
    slug: string;
    name: string;
    rarity: Record<string, unknown>;
    description: Record<string, unknown>;
    equipmentCategoryId?: string;
  };
  attuned: boolean;
}

export interface InventoryResponse {
  items: InventoryItemResponse[];
  magicItems: MagicItemInventoryResponse[];
  totalWeight: number;
  carryingCapacity: number;
  encumbered: boolean;
  gold: { cp: number; sp: number; gp: number; pp: number };
}

export interface GoldResponse {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
}

const MAX_ATTUNEMENTS = 3;

/**
 * RAW 2024 — weapon tem property `two-handed` (ocupa ambas mãos) ou
 * `versatile` (pode usar 1 ou 2 mãos — ao empunhar em 'main' é tratado como 1H).
 * Admin seeder grava properties como `{ name, slug }` ou `{ index }` — aceitar ambos.
 */
function isTwoHanded(equipment: EquipmentEntity | undefined | null): boolean {
  if (!equipment) return false;
  const props = (equipment.properties ?? []) as Array<{
    slug?: string;
    index?: string;
    name?: string;
  }>;
  if (!Array.isArray(props)) return false;
  return props.some(
    (p) =>
      (p.slug ?? p.index ?? "").toLowerCase() === "two-handed" ||
      (p.name ?? "").toLowerCase() === "two-handed",
  );
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterEquipmentEntity)
    private readonly charEquipRepo: Repository<CharacterEquipmentEntity>,
    @InjectRepository(CharacterMagicItemEntity)
    private readonly charMagicItemRepo: Repository<CharacterMagicItemEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly charStateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CharacterAbilityScoreEntity)
    private readonly charAbilityRepo: Repository<CharacterAbilityScoreEntity>,
    @InjectRepository(EquipmentEntity)
    private readonly equipmentRepo: Repository<EquipmentEntity>,
    @InjectRepository(MagicItemEntity)
    private readonly magicItemRepo: Repository<MagicItemEntity>,
    private readonly stateService: CharacterStateService,
  ) {}

  // ---- Helpers ----

  private async ensureOwnership(
    userId: string,
    characterId: string,
  ): Promise<CharacterEntity> {
    return ensureCharacterOwnership(this.characterRepo, userId, characterId);
  }

  private async getStrScore(characterId: string): Promise<number> {
    const abilities = await this.charAbilityRepo.find({
      where: { character_id: characterId },
    });
    const str = abilities.find((a) => a.ability_score.slug === "str");
    return str ? str.base_score + str.bonus : 10;
  }

  private mapEquipItem(ce: CharacterEquipmentEntity): InventoryItemResponse {
    const eq = ce.equipment;
    return {
      id: ce.id,
      equipment: {
        id: eq.id,
        slug: eq.slug,
        name: eq.name,
        weight: parseFloat(eq.weight) || 0,
        cost: eq.cost,
        damage: eq.damage ?? undefined,
        armorClass: eq.armor_class ?? undefined,
        properties: eq.properties ?? undefined,
        range: eq.range ?? undefined,
        description: eq.description ?? undefined,
      },
      quantity: ce.quantity,
      equipped: ce.equipped,
      mainHand: ce.mainHand,
      offHand: ce.offHand,
      source: ce.source,
    };
  }

  private mapMagicItem(
    cmi: CharacterMagicItemEntity,
  ): MagicItemInventoryResponse {
    const mi = cmi.magic_item;
    return {
      id: cmi.id,
      magicItem: {
        id: mi.id,
        slug: mi.slug,
        name: mi.name,
        rarity: mi.rarity,
        description: mi.description,
        equipmentCategoryId: mi.equipment_category_id ?? undefined,
      },
      attuned: cmi.attuned,
    };
  }

  // ---- Inventory CRUD ----

  async getInventory(
    userId: string,
    characterId: string,
  ): Promise<InventoryResponse> {
    await this.ensureOwnership(userId, characterId);

    const [items, magicItems, state, strScore] = await Promise.all([
      this.charEquipRepo.find({ where: { character_id: characterId } }),
      this.charMagicItemRepo.find({ where: { character_id: characterId } }),
      this.charStateRepo.findOne({ where: { character_id: characterId } }),
      this.getStrScore(characterId),
    ]);

    const totalWeight = items.reduce((sum, i) => {
      const w = parseFloat(i.equipment.weight) || 0;
      return sum + w * i.quantity;
    }, 0);

    const carryingCapacity = strScore * 15;

    return {
      items: items.map((i) => this.mapEquipItem(i)),
      magicItems: magicItems.map((mi) => this.mapMagicItem(mi)),
      totalWeight: Math.round(totalWeight * 100) / 100,
      carryingCapacity,
      encumbered: totalWeight > carryingCapacity,
      gold: {
        cp: state?.cp ?? 0,
        sp: state?.sp ?? 0,
        gp: state?.gp ?? 0,
        pp: state?.pp ?? 0,
      },
    };
  }

  async addItem(
    userId: string,
    characterId: string,
    dto: AddItemDto,
  ): Promise<InventoryItemResponse> {
    await this.ensureOwnership(userId, characterId);

    const equipment = await this.equipmentRepo.findOneBy({
      id: dto.equipmentId,
    });
    if (!equipment) {
      throw new NotFoundException("Equipamento nao encontrado na biblioteca.");
    }

    const existing = await this.charEquipRepo.findOne({
      where: {
        character_id: characterId,
        equipment_id: dto.equipmentId,
      },
    });

    if (existing) {
      existing.quantity += dto.quantity ?? 1;
      const saved = await this.charEquipRepo.save(existing);
      return this.mapEquipItem(saved);
    }

    const entry = this.charEquipRepo.create({
      character_id: characterId,
      equipment_id: dto.equipmentId,
      quantity: dto.quantity ?? 1,
      equipped: false,
      source: dto.source ?? EquipmentSourceEnum.Bought,
    });

    const saved = await this.charEquipRepo.save(entry);
    const loaded = await this.charEquipRepo.findOneOrFail({
      where: { id: saved.id },
    });
    return this.mapEquipItem(loaded);
  }

  async updateItemQuantity(
    userId: string,
    characterId: string,
    itemId: string,
    dto: UpdateItemDto,
  ): Promise<InventoryItemResponse> {
    await this.ensureOwnership(userId, characterId);

    const item = await this.charEquipRepo.findOne({
      where: { id: itemId, character_id: characterId },
    });
    if (!item) {
      throw new NotFoundException("Item nao encontrado no inventario.");
    }

    if (dto.quantity < 0) {
      throw new BadRequestException("Quantidade deve ser >= 0.");
    }
    if (dto.quantity === 0) {
      await this.charEquipRepo.remove(item);
      return this.mapEquipItem(item);
    }

    item.quantity = dto.quantity;
    const saved = await this.charEquipRepo.save(item);
    return this.mapEquipItem(saved);
  }

  async removeItem(
    userId: string,
    characterId: string,
    itemId: string,
  ): Promise<void> {
    await this.ensureOwnership(userId, characterId);

    const item = await this.charEquipRepo.findOne({
      where: { id: itemId, character_id: characterId },
    });
    if (!item) {
      throw new NotFoundException("Item nao encontrado no inventario.");
    }

    await this.charEquipRepo.remove(item);
  }

  // ---- Gold ----

  async updateGold(
    userId: string,
    characterId: string,
    dto: GoldUpdateDto,
  ): Promise<GoldResponse> {
    await this.ensureOwnership(userId, characterId);

    const state = await this.charStateRepo.findOne({
      where: { character_id: characterId },
    });
    if (!state) {
      throw new NotFoundException("Estado do personagem nao encontrado.");
    }

    if (dto.cp !== undefined) state.cp += dto.cp;
    if (dto.sp !== undefined) state.sp += dto.sp;
    if (dto.gp !== undefined) state.gp += dto.gp;
    if (dto.pp !== undefined) state.pp += dto.pp;

    if (state.cp < 0 || state.sp < 0 || state.gp < 0 || state.pp < 0) {
      throw new BadRequestException("Moedas nao podem ficar negativas.");
    }

    await this.charStateRepo.save(state);

    return { cp: state.cp, sp: state.sp, gp: state.gp, pp: state.pp };
  }

  // ---- Equip / Unequip ----

  async toggleEquip(
    userId: string,
    characterId: string,
    itemId: string,
    dto: EquipToggleDto,
  ): Promise<InventoryItemResponse> {
    await this.ensureOwnership(userId, characterId);

    const item = await this.charEquipRepo.findOne({
      where: { id: itemId, character_id: characterId },
    });
    if (!item) {
      throw new NotFoundException("Item nao encontrado no inventario.");
    }

    if (dto.equipped) {
      await this.validateEquip(characterId, item);
    }

    item.equipped = dto.equipped;
    const saved = await this.charEquipRepo.save(item);
    return this.mapEquipItem(saved);
  }

  private async validateEquip(
    characterId: string,
    item: CharacterEquipmentEntity,
  ): Promise<void> {
    const eq = item.equipment;
    const ac = eq.armor_class as Record<string, unknown> | null;
    const props = eq.properties as Record<string, unknown> | null;

    const isArmor = ac && (ac.base as number) > 0;
    const isShield =
      ac && !(ac.base as number) && ac.base !== undefined
        ? false
        : eq.slug?.includes("shield") ||
          eq.name?.toLowerCase().includes("shield");
    const isShieldByAc = ac && (ac.base as number) === 0;

    const equippedItems = await this.charEquipRepo.find({
      where: { character_id: characterId, equipped: true },
    });

    if (isArmor && !isShieldByAc) {
      const hasArmor = equippedItems.some((ei) => {
        if (ei.id === item.id) return false;
        const eiAc = ei.equipment.armor_class as Record<string, unknown> | null;
        return eiAc && (eiAc.base as number) > 0;
      });
      if (hasArmor) {
        throw new BadRequestException(
          "Ja existe uma armadura equipada. Desequipe-a primeiro.",
        );
      }
    }

    if (isShield || isShieldByAc) {
      const hasShield = equippedItems.some((ei) => {
        if (ei.id === item.id) return false;
        return (
          ei.equipment.slug?.includes("shield") ||
          ei.equipment.name?.toLowerCase().includes("shield")
        );
      });
      if (hasShield) {
        throw new BadRequestException(
          "Ja existe um escudo equipado. Desequipe-o primeiro.",
        );
      }
    }

    // Check STR minimum for heavy armor
    if (isArmor) {
      const raw = eq.raw as Record<string, unknown> | null;
      const strMin =
        (raw?.str_minimum as number) ??
        (props?.str_minimum as number) ??
        undefined;
      if (strMin) {
        const strScore = await this.getStrScore(characterId);
        if (strScore < strMin) {
          throw new BadRequestException(
            `Forca minima de ${strMin} necessaria para esta armadura. Sua Forca e ${strScore}.`,
          );
        }
      }
    }
  }

  // ---- Weapons in hand (RAW 2024) ----

  /**
   * Empunha ou guarda um item. Regras RAW 2024:
   * - `hand='main'`: ocupa main. Se item tem property `two-handed`, também
   *   limpa off_hand (2H weapon ocupa ambas — escudo em off deve ser guardado antes).
   * - `hand='off'`: ocupa off. Exige property `light` (dual-wielding) OU
   *   shield. Proibido se main atual é 2H.
   * - `hand=null`: guarda (stow). Limpa ambos main_hand e off_hand.
   *
   * Não altera `equipped` (pra armadura/shield AC isso é separado).
   */
  async setHand(
    userId: string,
    characterId: string,
    itemId: string,
    dto: SetHandDto,
  ): Promise<InventoryItemResponse> {
    await this.ensureOwnership(userId, characterId);

    const item = await this.charEquipRepo.findOne({
      where: { id: itemId, character_id: characterId },
    });
    if (!item) {
      throw new NotFoundException("Item nao encontrado no inventario.");
    }

    const eq = item.equipment;
    const isShield =
      eq.slug?.includes("shield") || eq.name?.toLowerCase().includes("shield");

    if (dto.hand === null) {
      item.mainHand = false;
      item.offHand = false;
      // Escudo: AC calc lê `equipped`. Sincroniza ao guardar.
      if (isShield) item.equipped = false;
      const saved = await this.charEquipRepo.save(item);
      return this.mapEquipItem(saved);
    }

    await this.validateSetHand(characterId, item, dto.hand);

    // Libera a mão alvo em QUALQUER outro item (a mão é exclusiva).
    // Também libera 2H conflicts: ao equipar em 'main' um 1H, se havia 2H
    // antes, ela sai de off automaticamente (porque era o mesmo item, main+off).
    const allInHand = await this.charEquipRepo.find({
      where: { character_id: characterId },
    });
    const targetCol = dto.hand === "main" ? "mainHand" : "offHand";
    for (const other of allInHand) {
      if (other.id === item.id) continue;
      if (other[targetCol]) {
        other[targetCol] = false;
        await this.charEquipRepo.save(other);
      }
      // Se o NOVO item é 2H e vai em main, também zera o off_hand dos outros
      if (dto.hand === "main" && isTwoHanded(item.equipment) && other.offHand) {
        other.offHand = false;
        await this.charEquipRepo.save(other);
      }
    }

    item.mainHand = dto.hand === "main";
    item.offHand = dto.hand === "off";
    // Se é 2H em main, também marca off (ocupa ambas)
    if (dto.hand === "main" && isTwoHanded(item.equipment)) {
      item.offHand = true;
    }
    // Escudo: AC calc lê `equipped`. Sincroniza ao empunhar.
    if (isShield) item.equipped = true;
    const saved = await this.charEquipRepo.save(item);
    return this.mapEquipItem(saved);
  }

  private async validateSetHand(
    characterId: string,
    item: CharacterEquipmentEntity,
    hand: "main" | "off",
  ): Promise<void> {
    const eq = item.equipment;
    const props = (eq.properties ?? []) as Array<{
      slug?: string;
      index?: string;
      name?: string;
    }>;
    const propSlugs = new Set(
      (Array.isArray(props) ? props : [])
        .map((p) => (p.slug ?? p.index ?? "").toLowerCase())
        .filter(Boolean),
    );
    const isWeapon = !!eq.damage;
    const isShield =
      eq.slug?.includes("shield") || eq.name?.toLowerCase().includes("shield");
    const isArmor = (() => {
      const ac = eq.armor_class as Record<string, unknown> | null;
      return ac && typeof ac.base === "number" && ac.base > 0;
    })();

    if (!isWeapon && !isShield) {
      throw new BadRequestException(
        "Apenas armas e escudos podem ser empunhados.",
      );
    }

    if (isArmor && !isShield) {
      throw new BadRequestException(
        "Armaduras nao sao empunhadas (use o toggle de equipar).",
      );
    }

    if (hand === "off") {
      // Off hand: light weapon (dual-wielding) OU shield
      const isLight = propSlugs.has("light");
      if (!isShield && !isLight) {
        throw new BadRequestException(
          'Mao secundaria exige arma com propriedade "Light" ou escudo.',
        );
      }

      // Main hand atual não pode ser 2H (pois 2H ocupa ambas)
      const mainHandItem = await this.charEquipRepo.findOne({
        where: { character_id: characterId, mainHand: true },
      });
      if (mainHandItem && mainHandItem.id !== item.id) {
        if (isTwoHanded(mainHandItem.equipment)) {
          throw new BadRequestException(
            "Mao principal empunha arma de duas maos. Guarde-a antes de usar a secundaria.",
          );
        }
      }
    }

    if (hand === "main" && isShield) {
      throw new BadRequestException(
        "Escudo nao pode ser empunhado na mao principal. Use a secundaria.",
      );
    }
  }

  // ---- Magic Items ----

  async addMagicItem(
    userId: string,
    characterId: string,
    dto: AddMagicItemDto,
  ): Promise<MagicItemInventoryResponse> {
    await this.ensureOwnership(userId, characterId);

    const magicItem = await this.magicItemRepo.findOneBy({
      id: dto.magicItemId,
    });
    if (!magicItem) {
      throw new NotFoundException("Item magico nao encontrado na biblioteca.");
    }

    const entry = this.charMagicItemRepo.create({
      character_id: characterId,
      magic_item_id: dto.magicItemId,
      attuned: false,
    });

    const saved = await this.charMagicItemRepo.save(entry);
    const loaded = await this.charMagicItemRepo.findOneOrFail({
      where: { id: saved.id },
    });
    return this.mapMagicItem(loaded);
  }

  async removeMagicItem(
    userId: string,
    characterId: string,
    itemId: string,
  ): Promise<void> {
    await this.ensureOwnership(userId, characterId);

    const item = await this.charMagicItemRepo.findOne({
      where: { id: itemId, character_id: characterId },
    });
    if (!item) {
      throw new NotFoundException("Item magico nao encontrado no inventario.");
    }

    await this.charMagicItemRepo.remove(item);
  }

  async toggleAttune(
    userId: string,
    characterId: string,
    itemId: string,
    dto: AttuneToggleDto,
  ): Promise<MagicItemInventoryResponse> {
    await this.ensureOwnership(userId, characterId);

    const item = await this.charMagicItemRepo.findOne({
      where: { id: itemId, character_id: characterId },
    });
    if (!item) {
      throw new NotFoundException("Item magico nao encontrado no inventario.");
    }

    if (dto.attuned) {
      const attunedCount = await this.charMagicItemRepo.count({
        where: { character_id: characterId, attuned: true },
      });
      const currentlyAttuned = item.attuned ? attunedCount - 1 : attunedCount;
      if (currentlyAttuned >= MAX_ATTUNEMENTS) {
        throw new BadRequestException(
          `Maximo de ${MAX_ATTUNEMENTS} attunements atingido. Desvincule um item primeiro.`,
        );
      }
    }

    item.attuned = dto.attuned;
    const saved = await this.charMagicItemRepo.save(item);
    return this.mapMagicItem(saved);
  }

  // ---- Use consumable ----

  private rollDice(expression: string): number {
    const match = expression.match(/^(\d+)d(\d+)(?:\+(\d+))?$/);
    if (!match) return parseInt(expression, 10) || 0;
    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const bonus = match[3] ? parseInt(match[3], 10) : 0;
    let total = bonus;
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
  }

  async useItem(
    userId: string,
    characterId: string,
    itemId: string,
  ): Promise<UseItemResult> {
    await this.ensureOwnership(userId, characterId);

    const item = await this.charEquipRepo.findOne({
      where: { id: itemId, character_id: characterId },
    });
    if (!item) {
      throw new NotFoundException("Item nao encontrado no inventario.");
    }

    // Decrement quantity (remove if 0)
    item.quantity -= 1;
    if (item.quantity <= 0) {
      await this.charEquipRepo.remove(item);
    } else {
      await this.charEquipRepo.save(item);
    }

    const slug = item.equipment.slug;
    const effect = item.equipment.consumable_effect as Record<
      string,
      unknown
    > | null;

    if (effect?.autoApply && effect?.type === "healing" && effect?.dice) {
      const rolled = this.rollDice(effect.dice as string);
      const hpResult = await this.stateService.updateHp(userId, characterId, {
        healing: rolled,
      });
      return {
        consumed: true,
        remainingQuantity: Math.max(0, item.quantity),
        effect: {
          type: "healing",
          healingApplied: rolled,
          newCurrentHp: hpResult.currentHp,
          maxHp: hpResult.maxHp,
          message: `${item.equipment.name}: recuperou ${rolled} HP (${effect.dice})`,
        },
      };
    }

    return {
      consumed: true,
      remainingQuantity: Math.max(0, item.quantity),
      effect: {
        type: "consumed",
        message: `${item.equipment.name} usado.`,
      },
    };
  }
}
