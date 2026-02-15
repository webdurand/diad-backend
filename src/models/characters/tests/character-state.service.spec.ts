import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CharacterStateService } from 'src/models/characters/services/character-state.service';
import { createMockRepository } from 'src/test-utils/mock-repositories';
import {
  makeCharacter,
  makeCharacterState,
  makeCharacterClass,
  makeCharacterAbilityScore,
  makeLevelUp,
  resetIdCounter,
} from 'src/test-utils/entity-factories';

describe('CharacterStateService', () => {
  let service: CharacterStateService;
  let characterRepo: ReturnType<typeof createMockRepository>;
  let stateRepo: ReturnType<typeof createMockRepository>;
  let charClassRepo: ReturnType<typeof createMockRepository>;
  let charAbilityRepo: ReturnType<typeof createMockRepository>;
  let charLevelUpRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    resetIdCounter();
    characterRepo = createMockRepository();
    stateRepo = createMockRepository();
    charClassRepo = createMockRepository();
    charAbilityRepo = createMockRepository();
    charLevelUpRepo = createMockRepository();

    service = new CharacterStateService(
      characterRepo as any,
      stateRepo as any,
      charClassRepo as any,
      charAbilityRepo as any,
      charLevelUpRepo as any,
    );
  });

  const setupOwnership = () => {
    characterRepo.findOne!.mockResolvedValue(makeCharacter());
  };

  const setupMaxHp = (hitDie: number, conScore: number, levelUpHp: number[] = []) => {
    const cc = makeCharacterClass('fighter', 1, {
      class: { id: 'cls-1', slug: 'fighter', name: 'Fighter', hit_die: hitDie },
    });
    charClassRepo.find!.mockResolvedValue([cc]);
    charAbilityRepo.find!.mockResolvedValue([
      makeCharacterAbilityScore('con', conScore),
    ]);
    charLevelUpRepo.find!.mockResolvedValue(
      levelUpHp.map((hp, i) => makeLevelUp('fighter', i + 2, hp)),
    );
  };

  // ---- HP Tests ----

  describe('updateHp()', () => {
    it('should apply simple damage', async () => {
      setupOwnership();
      const state = makeCharacterState({ current_hp: 30 });
      stateRepo.findOne!.mockResolvedValue(state);
      setupMaxHp(10, 10);

      const result = await service.updateHp('user-1', 'char-1', { damage: 10 });
      expect(result.currentHp).toBe(20);
    });

    it('should absorb damage with temp HP fully', async () => {
      setupOwnership();
      const state = makeCharacterState({ current_hp: 30, temp_hp: 10 });
      stateRepo.findOne!.mockResolvedValue(state);
      setupMaxHp(10, 10);

      const result = await service.updateHp('user-1', 'char-1', { damage: 8 });
      expect(result.currentHp).toBe(30);
      expect(result.tempHp).toBe(2);
    });

    it('should absorb damage partially with temp HP', async () => {
      setupOwnership();
      const state = makeCharacterState({ current_hp: 30, temp_hp: 5 });
      stateRepo.findOne!.mockResolvedValue(state);
      setupMaxHp(10, 10);

      const result = await service.updateHp('user-1', 'char-1', { damage: 15 });
      expect(result.currentHp).toBe(20);
      expect(result.tempHp).toBe(0);
    });

    it('should clamp HP minimum to 0', async () => {
      setupOwnership();
      const state = makeCharacterState({ current_hp: 5 });
      stateRepo.findOne!.mockResolvedValue(state);
      setupMaxHp(10, 10); // maxHp = 10

      // damage 8 drops HP to 0, but remaining(8) < maxHp(10): no instant death
      const result = await service.updateHp('user-1', 'char-1', { damage: 8 });
      expect(result.currentHp).toBe(0);
      expect(result.isDown).toBe(true);
    });

    it('should detect massive damage instant death', async () => {
      setupOwnership();
      const state = makeCharacterState({ current_hp: 20 });
      stateRepo.findOne!.mockResolvedValue(state);
      setupMaxHp(10, 10); // maxHp = 10 + 0 = 10
      // stateRepo for computeMaxHp
      stateRepo.findOne!.mockResolvedValue(state);

      const result = await service.updateHp('user-1', 'char-1', { damage: 40 });
      expect(result.instantDeath).toBe(true);
    });

    it('should apply simple healing', async () => {
      setupOwnership();
      const state = makeCharacterState({ current_hp: 5 });
      stateRepo.findOne!.mockResolvedValue(state);
      setupMaxHp(10, 10); // maxHp = 10

      const result = await service.updateHp('user-1', 'char-1', { healing: 3 });
      expect(result.currentHp).toBe(8);
    });

    it('should cap healing at max HP', async () => {
      setupOwnership();
      const state = makeCharacterState({ current_hp: 18 });
      stateRepo.findOne!.mockResolvedValue(state);
      setupMaxHp(10, 14); // maxHp = 10 + 2 = 12... wait, con 14 => mod +2 => maxHp = 10 + 2 = 12
      // Actually we need the state returned by computeMaxHp's stateRepo.findOne
      stateRepo.findOne!.mockImplementation(async () => state);

      const result = await service.updateHp('user-1', 'char-1', { healing: 10 });
      // maxHp is hit_die(10) + conMod(2) = 12, but current_hp starts at 18 which is > maxHp
      // healing caps at maxHp: since 18 > 12, healing 10 -> min(12, 28) = 12
      expect(result.currentHp).toBeLessThanOrEqual(result.maxHp);
    });

    it('should revive from 0 HP and reset death saves', async () => {
      setupOwnership();
      const state = makeCharacterState({
        current_hp: 0,
        death_saves_success: 2,
        death_saves_fail: 1,
      });
      stateRepo.findOne!.mockResolvedValue(state);
      setupMaxHp(10, 10);

      const result = await service.updateHp('user-1', 'char-1', { healing: 5 });
      expect(result.currentHp).toBe(5);
      expect(result.deathSaves.successes).toBe(0);
      expect(result.deathSaves.failures).toBe(0);
    });

    it('should overwrite temp HP (not stack)', async () => {
      setupOwnership();
      const state = makeCharacterState({ current_hp: 20, temp_hp: 5 });
      stateRepo.findOne!.mockResolvedValue(state);
      setupMaxHp(10, 10);

      const result = await service.updateHp('user-1', 'char-1', { tempHp: 10 });
      expect(result.tempHp).toBe(10);
    });

    it('should throw on negative damage', async () => {
      setupOwnership();
      await expect(
        service.updateHp('user-1', 'char-1', { damage: -5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if character not found', async () => {
      characterRepo.findOne!.mockResolvedValue(null);
      await expect(
        service.updateHp('user-1', 'char-1', { damage: 5 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---- XP Tests ----

  describe('updateXp()', () => {
    it('should add XP to existing total', async () => {
      setupOwnership();
      const state = makeCharacterState({ xp: 100 });
      stateRepo.findOne!.mockResolvedValue(state);
      charClassRepo.find!.mockResolvedValue([makeCharacterClass('fighter', 1)]);

      const result = await service.updateXp('user-1', 'char-1', { amount: 200 });
      expect(result.xp).toBe(300);
    });

    it('should throw on negative XP', async () => {
      setupOwnership();
      await expect(
        service.updateXp('user-1', 'char-1', { amount: -50 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should indicate levelUpAvailable when XP >= threshold', async () => {
      setupOwnership();
      const state = makeCharacterState({ xp: 0 });
      stateRepo.findOne!.mockResolvedValue(state);
      charClassRepo.find!.mockResolvedValue([makeCharacterClass('fighter', 1)]);

      const result = await service.updateXp('user-1', 'char-1', { amount: 300 });
      expect(result.levelUpAvailable).toBe(true);
      expect(result.nextLevelXp).toBe(300);
    });

    it('should not indicate levelUp when XP < threshold', async () => {
      setupOwnership();
      const state = makeCharacterState({ xp: 0 });
      stateRepo.findOne!.mockResolvedValue(state);
      charClassRepo.find!.mockResolvedValue([makeCharacterClass('fighter', 1)]);

      const result = await service.updateXp('user-1', 'char-1', { amount: 100 });
      expect(result.levelUpAvailable).toBe(false);
    });
  });

  // ---- Death Saves Tests ----

  describe('updateDeathSaves()', () => {
    it('should increment success', async () => {
      setupOwnership();
      const state = makeCharacterState({ death_saves_success: 0, death_saves_fail: 0 });
      stateRepo.findOne!.mockResolvedValue(state);

      const result = await service.updateDeathSaves('user-1', 'char-1', { success: true });
      expect(result.successes).toBe(1);
      expect(result.stabilized).toBe(false);
    });

    it('should stabilize at 3 successes', async () => {
      setupOwnership();
      const state = makeCharacterState({ death_saves_success: 2, death_saves_fail: 0 });
      stateRepo.findOne!.mockResolvedValue(state);

      const result = await service.updateDeathSaves('user-1', 'char-1', { success: true });
      expect(result.successes).toBe(3);
      expect(result.stabilized).toBe(true);
    });

    it('should die at 3 failures', async () => {
      setupOwnership();
      const state = makeCharacterState({ death_saves_success: 0, death_saves_fail: 2 });
      stateRepo.findOne!.mockResolvedValue(state);

      const result = await service.updateDeathSaves('user-1', 'char-1', { fail: true });
      expect(result.failures).toBe(3);
      expect(result.dead).toBe(true);
    });

    it('should reset death saves', async () => {
      setupOwnership();
      const state = makeCharacterState({ death_saves_success: 2, death_saves_fail: 1 });
      stateRepo.findOne!.mockResolvedValue(state);

      const result = await service.updateDeathSaves('user-1', 'char-1', { reset: true });
      expect(result.successes).toBe(0);
      expect(result.failures).toBe(0);
    });

    it('should cap successes at 3', async () => {
      setupOwnership();
      const state = makeCharacterState({ death_saves_success: 3, death_saves_fail: 0 });
      stateRepo.findOne!.mockResolvedValue(state);

      const result = await service.updateDeathSaves('user-1', 'char-1', { success: true });
      expect(result.successes).toBe(3);
    });
  });

  // ---- getXpInfo (static) ----

  describe('getXpInfo()', () => {
    it('level 1, XP 0 -> nextLevelXp=300, levelUpAvailable=false', () => {
      const info = CharacterStateService.getXpInfo(0, 1);
      expect(info.nextLevelXp).toBe(300);
      expect(info.levelUpAvailable).toBe(false);
    });

    it('level 1, XP 300 -> levelUpAvailable=true', () => {
      const info = CharacterStateService.getXpInfo(300, 1);
      expect(info.levelUpAvailable).toBe(true);
    });

    it('level 1, XP 500 -> levelUpAvailable=true', () => {
      const info = CharacterStateService.getXpInfo(500, 1);
      expect(info.levelUpAvailable).toBe(true);
    });

    it('level 20 -> nextLevelXp=null, levelUpAvailable=false', () => {
      const info = CharacterStateService.getXpInfo(999999, 20);
      expect(info.nextLevelXp).toBeNull();
      expect(info.levelUpAvailable).toBe(false);
    });

    it('level 5, XP 6500 -> nextLevelXp=14000, levelUpAvailable=false', () => {
      const info = CharacterStateService.getXpInfo(6500, 5);
      expect(info.nextLevelXp).toBe(14000);
      expect(info.levelUpAvailable).toBe(false);
    });

    it('level 5, XP 14000 -> levelUpAvailable=true', () => {
      const info = CharacterStateService.getXpInfo(14000, 5);
      expect(info.levelUpAvailable).toBe(true);
    });
  });
});
