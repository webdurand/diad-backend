import { ConditionEffectsService } from '../services/condition-effects.service';

describe('ConditionEffectsService', () => {
  let service: ConditionEffectsService;

  beforeEach(() => {
    service = new ConditionEffectsService();
  });

  describe('getAttackModifiers', () => {
    it('should give advantage when invisible', () => {
      const result = service.getAttackModifiers(['invisible']);
      expect(result.hasAdvantage).toBe(true);
      expect(result.hasDisadvantage).toBe(false);
    });

    it('should give disadvantage when blinded', () => {
      const result = service.getAttackModifiers(['blinded']);
      expect(result.hasDisadvantage).toBe(true);
    });

    it('should give disadvantage when poisoned', () => {
      const result = service.getAttackModifiers(['poisoned']);
      expect(result.hasDisadvantage).toBe(true);
    });

    it('should give disadvantage when frightened', () => {
      const result = service.getAttackModifiers(['frightened']);
      expect(result.hasDisadvantage).toBe(true);
    });

    it('should give disadvantage when prone', () => {
      const result = service.getAttackModifiers(['prone']);
      expect(result.hasDisadvantage).toBe(true);
    });

    it('should give disadvantage when restrained', () => {
      const result = service.getAttackModifiers(['restrained']);
      expect(result.hasDisadvantage).toBe(true);
    });

    it('should auto-fail when stunned', () => {
      const result = service.getAttackModifiers(['stunned']);
      expect(result.autoFail).toBe(true);
    });

    it('should auto-fail when paralyzed', () => {
      const result = service.getAttackModifiers(['paralyzed']);
      expect(result.autoFail).toBe(true);
    });

    it('should auto-fail when unconscious', () => {
      const result = service.getAttackModifiers(['unconscious']);
      expect(result.autoFail).toBe(true);
    });

    it('should auto-fail when petrified', () => {
      const result = service.getAttackModifiers(['petrified']);
      expect(result.autoFail).toBe(true);
    });

    it('should handle no conditions', () => {
      const result = service.getAttackModifiers([]);
      expect(result.hasAdvantage).toBe(false);
      expect(result.hasDisadvantage).toBe(false);
      expect(result.autoFail).toBe(false);
    });

    it('should handle multiple conditions', () => {
      const result = service.getAttackModifiers(['blinded', 'invisible']);
      expect(result.hasAdvantage).toBe(true);
      expect(result.hasDisadvantage).toBe(true);
    });
  });

  describe('getDefenseModifiers', () => {
    it('should give attackers advantage when defender is blinded', () => {
      const result = service.getDefenseModifiers(['blinded']);
      expect(result.attacksHaveAdvantage).toBe(true);
    });

    it('should give attackers advantage when defender is paralyzed', () => {
      const result = service.getDefenseModifiers(['paralyzed']);
      expect(result.attacksHaveAdvantage).toBe(true);
      expect(result.autoCritIfMelee).toBe(true);
    });

    it('should give attackers advantage when defender is unconscious', () => {
      const result = service.getDefenseModifiers(['unconscious']);
      expect(result.attacksHaveAdvantage).toBe(true);
      expect(result.autoCritIfMelee).toBe(true);
    });

    it('should give attackers advantage when defender is stunned', () => {
      const result = service.getDefenseModifiers(['stunned']);
      expect(result.attacksHaveAdvantage).toBe(true);
    });

    it('should give attackers advantage when defender is restrained', () => {
      const result = service.getDefenseModifiers(['restrained']);
      expect(result.attacksHaveAdvantage).toBe(true);
    });

    it('should give attackers disadvantage when defender is invisible', () => {
      const result = service.getDefenseModifiers(['invisible']);
      expect(result.attacksHaveDisadvantage).toBe(true);
    });

    it('should NOT auto-crit melee for stunned (only paralyzed/unconscious)', () => {
      const result = service.getDefenseModifiers(['stunned']);
      expect(result.autoCritIfMelee).toBe(false);
    });
  });

  describe('getSavingThrowModifiers', () => {
    it('should auto-fail STR saves when paralyzed', () => {
      const result = service.getSavingThrowModifiers(['paralyzed'], 'str');
      expect(result.autoFail).toBe(true);
    });

    it('should auto-fail DEX saves when stunned', () => {
      const result = service.getSavingThrowModifiers(['stunned'], 'dex');
      expect(result.autoFail).toBe(true);
    });

    it('should auto-fail DEX saves when unconscious', () => {
      const result = service.getSavingThrowModifiers(['unconscious'], 'dex');
      expect(result.autoFail).toBe(true);
    });

    it('should auto-fail STR saves when petrified', () => {
      const result = service.getSavingThrowModifiers(['petrified'], 'str');
      expect(result.autoFail).toBe(true);
    });

    it('should NOT auto-fail WIS saves when paralyzed', () => {
      const result = service.getSavingThrowModifiers(['paralyzed'], 'wis');
      expect(result.autoFail).toBe(false);
    });

    it('should NOT auto-fail CON saves when stunned', () => {
      const result = service.getSavingThrowModifiers(['stunned'], 'con');
      expect(result.autoFail).toBe(false);
    });

    it('should handle no conditions', () => {
      const result = service.getSavingThrowModifiers([], 'str');
      expect(result.autoFail).toBe(false);
      expect(result.hasAdvantage).toBe(false);
      expect(result.hasDisadvantage).toBe(false);
    });
  });

  describe('canTakeAction', () => {
    it('should return true with no conditions', () => {
      expect(service.canTakeAction([])).toBe(true);
    });

    it('should return true when blinded (can still act)', () => {
      expect(service.canTakeAction(['blinded'])).toBe(true);
    });

    it('should return true when frightened', () => {
      expect(service.canTakeAction(['frightened'])).toBe(true);
    });

    it('should return false when incapacitated', () => {
      expect(service.canTakeAction(['incapacitated'])).toBe(false);
    });

    it('should return false when stunned', () => {
      expect(service.canTakeAction(['stunned'])).toBe(false);
    });

    it('should return false when paralyzed', () => {
      expect(service.canTakeAction(['paralyzed'])).toBe(false);
    });

    it('should return false when petrified', () => {
      expect(service.canTakeAction(['petrified'])).toBe(false);
    });

    it('should return false when unconscious', () => {
      expect(service.canTakeAction(['unconscious'])).toBe(false);
    });
  });

  describe('canTakeReaction', () => {
    it('should mirror canTakeAction', () => {
      expect(service.canTakeReaction([])).toBe(true);
      expect(service.canTakeReaction(['stunned'])).toBe(false);
      expect(service.canTakeReaction(['blinded'])).toBe(true);
    });
  });

  describe('canMove', () => {
    it('should return true with no conditions', () => {
      expect(service.canMove([])).toBe(true);
    });

    it('should return false when grappled', () => {
      expect(service.canMove(['grappled'])).toBe(false);
    });

    it('should return false when restrained', () => {
      expect(service.canMove(['restrained'])).toBe(false);
    });

    it('should return false when stunned', () => {
      expect(service.canMove(['stunned'])).toBe(false);
    });

    it('should return false when paralyzed', () => {
      expect(service.canMove(['paralyzed'])).toBe(false);
    });

    it('should return false when petrified', () => {
      expect(service.canMove(['petrified'])).toBe(false);
    });

    it('should return false when unconscious', () => {
      expect(service.canMove(['unconscious'])).toBe(false);
    });

    it('should return true when blinded (can still move)', () => {
      expect(service.canMove(['blinded'])).toBe(true);
    });

    it('should return true when prone (can crawl)', () => {
      expect(service.canMove(['prone'])).toBe(true);
    });
  });

  describe('getSpeedMultiplier', () => {
    it('should return 1 with no conditions', () => {
      expect(service.getSpeedMultiplier([])).toBe(1);
    });

    it('should return 0 when grappled', () => {
      expect(service.getSpeedMultiplier(['grappled'])).toBe(0);
    });

    it('should return 1 when prone (crawling is half speed but handled elsewhere)', () => {
      expect(service.getSpeedMultiplier(['prone'])).toBe(1);
    });
  });

  describe('getStartOfTurnEffects', () => {
    it('should return frightened check when frightened', () => {
      const effects = service.getStartOfTurnEffects(['frightened']);
      expect(effects).toHaveLength(1);
      expect(effects[0].condition).toBe('frightened');
      expect(effects[0].effect).toBe('check_source_visible');
    });

    it('should return empty for no conditions', () => {
      expect(service.getStartOfTurnEffects([])).toEqual([]);
    });
  });

  describe('getEndOfTurnEffects', () => {
    it('should return repeat_save for frightened', () => {
      const effects = service.getEndOfTurnEffects(['frightened']);
      expect(effects.some((e) => e.condition === 'frightened')).toBe(true);
    });

    it('should return repeat_save for stunned', () => {
      const effects = service.getEndOfTurnEffects(['stunned']);
      expect(effects.some((e) => e.condition === 'stunned')).toBe(true);
    });

    it('should return repeat_save for charmed', () => {
      const effects = service.getEndOfTurnEffects(['charmed']);
      expect(effects.some((e) => e.condition === 'charmed')).toBe(true);
    });

    it('should return multiple effects for multiple conditions', () => {
      const effects = service.getEndOfTurnEffects(['frightened', 'stunned']);
      expect(effects).toHaveLength(2);
    });
  });

  describe('getConditionSummary', () => {
    it('should return summaries for active conditions', () => {
      const summaries = service.getConditionSummary([
        'blinded',
        'poisoned',
      ]);
      expect(summaries).toHaveLength(2);
      expect(summaries[0]).toContain('Blinded');
      expect(summaries[1]).toContain('Poisoned');
    });

    it('should return empty array for no conditions', () => {
      expect(service.getConditionSummary([])).toEqual([]);
    });

    it('should handle all 14 combat conditions', () => {
      const all = [
        'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
        'incapacitated', 'invisible', 'paralyzed', 'petrified',
        'poisoned', 'prone', 'restrained', 'stunned', 'unconscious',
      ];
      const summaries = service.getConditionSummary(all);
      expect(summaries).toHaveLength(14);
    });
  });
});
