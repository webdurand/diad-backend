import { SavingThrowService, SavingThrowDto } from '../services/saving-throw.service';
import { DiceService } from '../services/dice.service';
import { ConditionEffectsService } from '../services/condition-effects.service';

const mockSheet = {
  savingThrows: [
    { slug: 'str', name: 'Strength', proficient: true, bonus: 5 },
    { slug: 'dex', name: 'Dexterity', proficient: false, bonus: 2 },
    { slug: 'con', name: 'Constitution', proficient: true, bonus: 3 },
    { slug: 'int', name: 'Intelligence', proficient: false, bonus: 0 },
    { slug: 'wis', name: 'Wisdom', proficient: false, bonus: 1 },
    { slug: 'cha', name: 'Charisma', proficient: false, bonus: -1 },
  ],
  conditions: [],
};

const mockSheetService = {
  computeSheet: jest.fn().mockResolvedValue(mockSheet),
};

const mockEventService = {
  emit: jest.fn(),
};

describe('SavingThrowService', () => {
  let service: SavingThrowService;
  let diceService: DiceService;

  beforeEach(() => {
    diceService = new DiceService();
    diceService.setSeed(42);
    service = new SavingThrowService(
      mockSheetService as any,
      diceService,
      new ConditionEffectsService(),
      mockEventService as any,
      { consumeIfArmed: async () => ({ consumed: false }) } as any,
    );
    mockSheetService.computeSheet.mockResolvedValue({ ...mockSheet, conditions: [] });
  });

  const baseDto: SavingThrowDto = {
    characterId: 'char-1',
    userId: 'user-1',
    ability: 'str',
    dc: 15,
  };

  it('should roll a basic saving throw', async () => {
    const result = await service.rollSavingThrow(baseDto);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ability).toBe('str');
    expect(result.value.modifier).toBe(5); // STR save bonus (proficient)
    expect(result.value.dc).toBe(15);
    expect(result.value.roll).toBeGreaterThanOrEqual(1);
    expect(result.value.roll).toBeLessThanOrEqual(20);
    expect(result.value.total).toBe(result.value.roll + 5);
    expect(result.value.success).toBe(result.value.total >= 15);
  });

  it('should use correct modifier for non-proficient saves', async () => {
    const result = await service.rollSavingThrow({ ...baseDto, ability: 'cha' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.modifier).toBe(-1);
  });

  it('should fail when character not found', async () => {
    mockSheetService.computeSheet.mockResolvedValueOnce(null);
    const result = await service.rollSavingThrow(baseDto);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_PARTICIPANT');
  });

  it('should fail when ability not found', async () => {
    const result = await service.rollSavingThrow({ ...baseDto, ability: 'xyz' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_ACTION');
  });

  it('should auto-fail STR/DEX saves when paralyzed', async () => {
    mockSheetService.computeSheet.mockResolvedValueOnce({
      ...mockSheet,
      conditions: ['paralyzed'],
    });
    const result = await service.rollSavingThrow({ ...baseDto, ability: 'str' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(false);
    expect(result.value.roll).toBe(0);
  });

  it('should NOT auto-fail WIS save when paralyzed', async () => {
    mockSheetService.computeSheet.mockResolvedValueOnce({
      ...mockSheet,
      conditions: ['paralyzed'],
    });
    const result = await service.rollSavingThrow({ ...baseDto, ability: 'wis' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // WIS is not STR/DEX, so paralyzed should not auto-fail it
    expect(result.value.roll).toBeGreaterThanOrEqual(1);
  });

  it('should handle advantage', async () => {
    const result = await service.rollSavingThrow({ ...baseDto, advantage: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.advantage).toBeDefined();
    expect(result.value.advantage!.roll1).toBeGreaterThanOrEqual(1);
    expect(result.value.advantage!.roll2).toBeGreaterThanOrEqual(1);
    expect(result.value.advantage!.chosen).toBe(
      Math.max(result.value.advantage!.roll1, result.value.advantage!.roll2),
    );
  });

  it('should produce GameEventData', async () => {
    const result = await service.rollSavingThrow(baseDto);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.length).toBe(1);
    expect(result.events[0].event_type).toBe('saving_throw');
    expect(result.events[0].data.ability).toBe('str');
    expect(result.events[0].data.dc).toBe(15);
  });
});
