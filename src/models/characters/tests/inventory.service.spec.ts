import { BadRequestException, NotFoundException } from "@nestjs/common";
import { InventoryService } from "src/models/characters/services/inventory.service";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import { createMockRepository } from "src/shared/test-utils/mock-repositories";
import {
  makeCharacter,
  makeCharacterEquipment,
  makeCharacterMagicItem,
  makeCharacterState,
  makeCharacterAbilityScores,
  makeEquipment,
  makeMagicItem,
  resetIdCounter,
} from "src/shared/test-utils/entity-factories";
import { EquipmentSourceEnum } from "src/entities/enums";

describe("InventoryService", () => {
  let service: InventoryService;
  let repos: Record<string, ReturnType<typeof createMockRepository>>;
  let stateService: Partial<CharacterStateService>;

  beforeEach(() => {
    resetIdCounter();
    repos = {
      character: createMockRepository(),
      charEquip: createMockRepository(),
      charMagicItem: createMockRepository(),
      charState: createMockRepository(),
      charAbility: createMockRepository(),
      equipment: createMockRepository(),
      magicItem: createMockRepository(),
    };

    stateService = {
      updateHp: jest.fn().mockResolvedValue({ currentHp: 10, maxHp: 20 }),
    };

    service = new InventoryService(
      repos.character as any,
      repos.charEquip as any,
      repos.charMagicItem as any,
      repos.charState as any,
      repos.charAbility as any,
      repos.equipment as any,
      repos.magicItem as any,
      stateService as CharacterStateService,
    );
  });

  const setupOwnership = () => {
    repos.character.findOne!.mockResolvedValue(makeCharacter());
  };

  describe("getInventory", () => {
    it("should return inventory with total weight and carrying capacity", async () => {
      setupOwnership();
      const items = [
        makeCharacterEquipment("longsword", {
          equipped: true,
          equipmentOverrides: { weight: "3" },
        }),
        makeCharacterEquipment("chain-mail", {
          equipped: true,
          quantity: 1,
          equipmentOverrides: { weight: "55" },
        }),
      ];

      repos.charEquip.find!.mockResolvedValue(items);
      repos.charMagicItem.find!.mockResolvedValue([]);
      repos.charState.findOne!.mockResolvedValue(
        makeCharacterState({ gp: 50 }),
      );
      repos.charAbility.find!.mockResolvedValue(
        makeCharacterAbilityScores({ str: 16 }),
      );

      const result = await service.getInventory("user-1", "char-1");

      expect(result.totalWeight).toBe(58); // 3 + 55
      expect(result.carryingCapacity).toBe(240); // 16 * 15
      expect(result.encumbered).toBe(false);
      expect(result.gold.gp).toBe(50);
    });

    it("should detect encumbered when totalWeight > carryingCapacity", async () => {
      setupOwnership();
      repos.charEquip.find!.mockResolvedValue([
        makeCharacterEquipment("anvil", {
          quantity: 10,
          equipmentOverrides: { weight: "20" },
        }),
      ]);
      repos.charMagicItem.find!.mockResolvedValue([]);
      repos.charState.findOne!.mockResolvedValue(makeCharacterState());
      repos.charAbility.find!.mockResolvedValue(
        makeCharacterAbilityScores({ str: 8 }), // capacity = 8*15 = 120
      );

      const result = await service.getInventory("user-1", "char-1");

      expect(result.totalWeight).toBe(200); // 20 * 10
      expect(result.encumbered).toBe(true);
    });
  });

  describe("addItem", () => {
    it("should add a new item to inventory", async () => {
      setupOwnership();
      const eq = makeEquipment("longsword");
      repos.equipment.findOneBy!.mockResolvedValue(eq);
      repos.charEquip.findOne!.mockResolvedValue(null); // not existing
      repos.charEquip.create!.mockReturnValue({
        id: "new-item",
        equipment: eq,
      });
      repos.charEquip.save!.mockResolvedValue({
        id: "new-item",
        equipment: eq,
      });
      repos.charEquip.findOneOrFail!.mockResolvedValue({
        id: "new-item",
        equipment: eq,
        quantity: 1,
        equipped: false,
        source: EquipmentSourceEnum.Bought,
      });

      const result = await service.addItem("user-1", "char-1", {
        equipmentId: eq.id,
      });

      expect(result.equipment.slug).toBe("longsword");
    });

    it("should increase quantity if item already exists", async () => {
      setupOwnership();
      const eq = makeEquipment("arrow");
      const existing = makeCharacterEquipment("arrow", {
        quantity: 10,
        equipmentOverrides: { weight: "0.05" },
      });
      repos.equipment.findOneBy!.mockResolvedValue(eq);
      repos.charEquip.findOne!.mockResolvedValue(existing);
      repos.charEquip.save!.mockResolvedValue({ ...existing, quantity: 15 });

      const result = await service.addItem("user-1", "char-1", {
        equipmentId: eq.id,
        quantity: 5,
      });

      expect(existing.quantity).toBe(15); // 10 + 5
    });

    it("should throw NotFoundException for unknown equipment", async () => {
      setupOwnership();
      repos.equipment.findOneBy!.mockResolvedValue(null);

      await expect(
        service.addItem("user-1", "char-1", { equipmentId: "nonexistent" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("updateItemQuantity", () => {
    it("should update item quantity", async () => {
      setupOwnership();
      const item = makeCharacterEquipment("arrow", { quantity: 10 });
      repos.charEquip.findOne!.mockResolvedValue(item);
      repos.charEquip.save!.mockResolvedValue({ ...item, quantity: 5 });

      const result = await service.updateItemQuantity(
        "user-1",
        "char-1",
        item.id,
        {
          quantity: 5,
        },
      );

      expect(item.quantity).toBe(5);
    });

    it("should remove item when quantity is 0", async () => {
      setupOwnership();
      const item = makeCharacterEquipment("potion", { quantity: 1 });
      repos.charEquip.findOne!.mockResolvedValue(item);

      await service.updateItemQuantity("user-1", "char-1", item.id, {
        quantity: 0,
      });

      expect(repos.charEquip.remove).toHaveBeenCalledWith(item);
    });

    it("should reject negative quantity", async () => {
      setupOwnership();
      const item = makeCharacterEquipment("arrow", { quantity: 10 });
      repos.charEquip.findOne!.mockResolvedValue(item);

      await expect(
        service.updateItemQuantity("user-1", "char-1", item.id, {
          quantity: -1,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("updateGold", () => {
    it("should add gold", async () => {
      setupOwnership();
      const state = makeCharacterState({ gp: 50, sp: 10 });
      repos.charState.findOne!.mockResolvedValue(state);
      repos.charState.save!.mockResolvedValue(state);

      const result = await service.updateGold("user-1", "char-1", { gp: 25 });

      expect(result.gp).toBe(75);
    });

    it("should subtract gold", async () => {
      setupOwnership();
      const state = makeCharacterState({ gp: 50 });
      repos.charState.findOne!.mockResolvedValue(state);
      repos.charState.save!.mockResolvedValue(state);

      const result = await service.updateGold("user-1", "char-1", { gp: -30 });

      expect(result.gp).toBe(20);
    });

    it("should reject if gold would go negative", async () => {
      setupOwnership();
      const state = makeCharacterState({ gp: 10 });
      repos.charState.findOne!.mockResolvedValue(state);

      await expect(
        service.updateGold("user-1", "char-1", { gp: -20 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("toggleEquip", () => {
    it("should equip an item", async () => {
      setupOwnership();
      const item = makeCharacterEquipment("longsword");
      repos.charEquip.findOne!.mockImplementation(async (opts: any) => {
        if (opts?.where?.equipped) return null; // no validate conflicts
        return item;
      });
      repos.charEquip.find!.mockResolvedValue([]); // no equipped items
      repos.charEquip.save!.mockResolvedValue({ ...item, equipped: true });

      const result = await service.toggleEquip("user-1", "char-1", item.id, {
        equipped: true,
      });

      expect(item.equipped).toBe(true);
    });

    it("should reject equipping a second armor", async () => {
      setupOwnership();
      const newArmor = makeCharacterEquipment("plate-armor", {
        equipmentOverrides: {
          armor_class: { base: 18, dex_bonus: false },
          weight: "65",
        },
      });
      const existingArmor = makeCharacterEquipment("chain-mail", {
        equipped: true,
        equipmentOverrides: {
          armor_class: { base: 16, dex_bonus: false },
          weight: "55",
        },
      });

      repos.charEquip.findOne!.mockResolvedValue(newArmor);
      repos.charEquip.find!.mockResolvedValue([existingArmor]); // already equipped

      await expect(
        service.toggleEquip("user-1", "char-1", newArmor.id, {
          equipped: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException for missing item", async () => {
      setupOwnership();
      repos.charEquip.findOne!.mockResolvedValue(null);

      await expect(
        service.toggleEquip("user-1", "char-1", "no-item", { equipped: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("setHand — shield AC sync", () => {
    // AC calc em character-sheet.service lê `eq.equipped` pra detectar shield.
    // setHand precisa sincronizar `equipped` com presença em mão pra escudo
    // não sumir do AC quando empunhado via paper-doll.
    const buildShield = () =>
      makeCharacterEquipment("shield", {
        equipmentOverrides: {
          name: "Shield",
          armor_class: { base: 2 },
          weight: "6",
        },
      });

    it("setHand('off') em escudo marca equipped=true", async () => {
      setupOwnership();
      const shield = buildShield();
      shield.equipped = false;
      repos.charEquip.findOne!.mockResolvedValue(shield);
      repos.charEquip.find!.mockResolvedValue([shield]);
      repos.charEquip.save!.mockImplementation(async (s: any) => s);

      await service.setHand("user-1", "char-1", shield.id, { hand: "off" });

      expect(shield.offHand).toBe(true);
      expect(shield.equipped).toBe(true);
    });

    it("setHand(null) em escudo marca equipped=false", async () => {
      setupOwnership();
      const shield = buildShield();
      shield.equipped = true;
      shield.offHand = true;
      repos.charEquip.findOne!.mockResolvedValue(shield);
      repos.charEquip.save!.mockImplementation(async (s: any) => s);

      await service.setHand("user-1", "char-1", shield.id, { hand: null });

      expect(shield.offHand).toBe(false);
      expect(shield.equipped).toBe(false);
    });

    it("setHand não toca equipped em armas (só escudo)", async () => {
      setupOwnership();
      const longsword = makeCharacterEquipment("longsword", {
        equipmentOverrides: {
          damage: { dice: "1d8", type: "slashing" },
        },
      });
      longsword.equipped = false;
      repos.charEquip.findOne!.mockResolvedValue(longsword);
      repos.charEquip.find!.mockResolvedValue([longsword]);
      repos.charEquip.save!.mockImplementation(async (s: any) => s);

      await service.setHand("user-1", "char-1", longsword.id, { hand: "main" });

      expect(longsword.mainHand).toBe(true);
      expect(longsword.equipped).toBe(false);
    });
  });

  describe("toggleAttune", () => {
    it("should attune a magic item", async () => {
      setupOwnership();
      const item = makeCharacterMagicItem({ attuned: false });
      repos.charMagicItem.findOne!.mockResolvedValue(item);
      repos.charMagicItem.count!.mockResolvedValue(0);
      repos.charMagicItem.save!.mockResolvedValue({ ...item, attuned: true });

      const result = await service.toggleAttune("user-1", "char-1", item.id, {
        attuned: true,
      });

      expect(item.attuned).toBe(true);
    });

    it("should reject attunement beyond MAX_ATTUNEMENTS (3)", async () => {
      setupOwnership();
      const item = makeCharacterMagicItem({ attuned: false });
      repos.charMagicItem.findOne!.mockResolvedValue(item);
      repos.charMagicItem.count!.mockResolvedValue(3); // already at max

      await expect(
        service.toggleAttune("user-1", "char-1", item.id, { attuned: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should allow removing attunement", async () => {
      setupOwnership();
      const item = makeCharacterMagicItem({ attuned: true });
      repos.charMagicItem.findOne!.mockResolvedValue(item);
      repos.charMagicItem.save!.mockResolvedValue({ ...item, attuned: false });

      const result = await service.toggleAttune("user-1", "char-1", item.id, {
        attuned: false,
      });

      expect(item.attuned).toBe(false);
    });
  });

  describe("useItem", () => {
    it("should decrement quantity and remove if 0", async () => {
      setupOwnership();
      const item = makeCharacterEquipment("potion-of-healing", {
        quantity: 1,
        equipmentOverrides: { consumable_effect: null },
      });
      repos.charEquip.findOne!.mockResolvedValue(item);

      const result = await service.useItem("user-1", "char-1", item.id);

      expect(result.consumed).toBe(true);
      expect(result.remainingQuantity).toBe(0);
      expect(repos.charEquip.remove).toHaveBeenCalled();
    });

    it("should auto-apply healing for healing consumables", async () => {
      setupOwnership();
      const item = makeCharacterEquipment("potion-of-healing", {
        quantity: 3,
        equipmentOverrides: {
          consumable_effect: {
            autoApply: true,
            type: "healing",
            dice: "2d4+2",
          },
        },
      });
      repos.charEquip.findOne!.mockResolvedValue(item);
      repos.charEquip.save!.mockResolvedValue(item);
      (stateService.updateHp as jest.Mock).mockResolvedValue({
        currentHp: 15,
        maxHp: 20,
      });

      const result = await service.useItem("user-1", "char-1", item.id);

      expect(result.consumed).toBe(true);
      expect(result.effect?.type).toBe("healing");
      expect(result.effect?.newCurrentHp).toBe(15);
      expect(stateService.updateHp).toHaveBeenCalled();
    });

    it("should throw NotFoundException for missing item", async () => {
      setupOwnership();
      repos.charEquip.findOne!.mockResolvedValue(null);

      await expect(
        service.useItem("user-1", "char-1", "no-item"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("error handling", () => {
    it("should throw NotFoundException for missing character", async () => {
      repos.character.findOne!.mockResolvedValue(null);

      await expect(service.getInventory("user-1", "no-char")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
