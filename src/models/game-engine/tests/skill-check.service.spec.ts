import {
  SkillCheckService,
  SkillCheckDto,
} from "../services/skill-check.service";
import { DiceService } from "../services/dice.service";
import { ConditionEffectsService } from "../services/condition-effects.service";
import { ExhaustionService } from "../services/exhaustion.service";

// Minimal mock of CharacterSheetService
const mockSheet = {
  abilityScores: [
    { slug: "str", name: "Strength", score: 16, modifier: 3 },
    { slug: "dex", name: "Dexterity", score: 14, modifier: 2 },
    { slug: "con", name: "Constitution", score: 12, modifier: 1 },
    { slug: "int", name: "Intelligence", score: 10, modifier: 0 },
    { slug: "wis", name: "Wisdom", score: 13, modifier: 1 },
    { slug: "cha", name: "Charisma", score: 8, modifier: -1 },
  ],
  skills: [
    {
      slug: "athletics",
      name: "Athletics",
      bonus: 5,
      proficient: true,
      expertise: false,
    },
    {
      slug: "stealth",
      name: "Stealth",
      bonus: 4,
      proficient: true,
      expertise: false,
    },
    {
      slug: "perception",
      name: "Perception",
      bonus: 3,
      proficient: true,
      expertise: false,
    },
    {
      slug: "persuasion",
      name: "Persuasion",
      bonus: -1,
      proficient: false,
      expertise: false,
    },
    {
      slug: "acrobatics",
      name: "Acrobatics",
      bonus: 6,
      proficient: true,
      expertise: true,
    },
  ],
  conditions: [],
};

const mockSheetService = {
  computeSheet: jest.fn().mockResolvedValue(mockSheet),
};

const mockEventService = {
  emit: jest.fn(),
};

describe("SkillCheckService", () => {
  let service: SkillCheckService;
  let diceService: DiceService;

  beforeEach(() => {
    diceService = new DiceService();
    diceService.setSeed(42);
    service = new SkillCheckService(
      mockSheetService as any,
      diceService,
      new ConditionEffectsService(),
      mockEventService as any,
      { consumeIfArmed: async () => ({ consumed: false }) } as any,
      new ExhaustionService(),
    );
    mockSheetService.computeSheet.mockResolvedValue({
      ...mockSheet,
      conditions: [],
    });
  });

  const baseDto: SkillCheckDto = {
    characterId: "char-1",
    userId: "user-1",
    ability: "str",
    dc: 15,
  };

  it("should roll a basic ability check", async () => {
    const result = await service.rollAbilityCheck(baseDto);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ability).toBe("str");
    expect(result.value.modifier).toBe(3); // STR mod
    expect(result.value.dc).toBe(15);
    expect(result.value.roll).toBeGreaterThanOrEqual(1);
    expect(result.value.roll).toBeLessThanOrEqual(20);
    expect(result.value.total).toBe(result.value.roll + 3);
    expect(result.value.success).toBe(result.value.total >= 15);
  });

  it("should use skill modifier when skill is specified", async () => {
    const result = await service.rollAbilityCheck({
      ...baseDto,
      ability: "str",
      skill: "athletics",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.modifier).toBe(5); // Athletics bonus
    expect(result.value.proficient).toBe(true);
    expect(result.value.skill).toBe("athletics");
  });

  it("should detect expertise", async () => {
    const result = await service.rollAbilityCheck({
      ...baseDto,
      ability: "dex",
      skill: "acrobatics",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.modifier).toBe(6);
    expect(result.value.expertise).toBe(true);
  });

  it("should fail when character not found", async () => {
    mockSheetService.computeSheet.mockResolvedValueOnce(null);
    const result = await service.rollAbilityCheck(baseDto);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_PARTICIPANT");
  });

  it("should fail when ability not found", async () => {
    const result = await service.rollAbilityCheck({
      ...baseDto,
      ability: "xyz",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_ACTION");
  });

  it("should auto-fail when incapacitated", async () => {
    mockSheetService.computeSheet.mockResolvedValueOnce({
      ...mockSheet,
      conditions: ["stunned"],
    });
    const result = await service.rollAbilityCheck(baseDto);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(false);
    expect(result.value.roll).toBe(0);
    expect(result.value.total).toBe(0);
  });

  it("should apply disadvantage when poisoned", async () => {
    mockSheetService.computeSheet.mockResolvedValueOnce({
      ...mockSheet,
      conditions: ["poisoned"],
    });
    const result = await service.rollAbilityCheck(baseDto);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.advantage).toBeDefined();
  });

  it("should handle manual advantage override", async () => {
    const result = await service.rollAbilityCheck({
      ...baseDto,
      advantage: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.advantage).toBeDefined();
    expect(result.value.advantage!.roll1).toBeGreaterThanOrEqual(1);
    expect(result.value.advantage!.roll2).toBeGreaterThanOrEqual(1);
  });

  it("should produce GameEventData", async () => {
    const result = await service.rollAbilityCheck(baseDto);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.length).toBe(1);
    expect(result.events[0].event_type).toBe("skill_check");
    expect(result.events[0].data.ability).toBe("str");
    expect(result.events[0].data.dc).toBe(15);
  });
});
