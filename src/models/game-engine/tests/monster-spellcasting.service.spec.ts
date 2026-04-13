import { MonsterSpellcastingService } from '../services/monster-spellcasting.service';

function makeParticipant(spellcasting: any, used: any = {}): any {
  return {
    id: 'p-1',
    type: 'monster',
    spellSlotsUsed: used,
    monster: { spellcasting },
  };
}

describe('MonsterSpellcastingService', () => {
  const svc = new MonsterSpellcastingService();

  describe('standard spellcasting (Archmage)', () => {
    const sc = {
      type: 'standard',
      ability: 'int',
      saveDc: 18,
      attackBonus: 10,
      casterLevel: 18,
      slotsByLevel: { 3: 3, 5: 3 },
      knownSpells: [
        { slug: 'fire-bolt', level: 0 },
        { slug: 'fireball', level: 3 },
        { slug: 'cone-of-cold', level: 5 },
      ],
    };

    it('lists cantrip as always available (no slot)', () => {
      const p = makeParticipant(sc);
      const list = svc.getAvailability(p);
      const cantrip = list.find((s) => s.slug === 'fire-bolt');
      expect(cantrip).toBeDefined();
      expect(cantrip?.slotRemaining).toBeUndefined();
    });

    it('lists leveled spell with slots remaining', () => {
      const p = makeParticipant(sc, { byLevel: { 3: 1 } });
      const list = svc.getAvailability(p);
      const fb = list.find((s) => s.slug === 'fireball');
      expect(fb?.slotRemaining).toBe(2);
    });

    it('allows casting when slot is available', () => {
      const p = makeParticipant(sc);
      expect(svc.canCast(p, 'fireball', 3).allowed).toBe(true);
      expect(svc.canCast(p, 'cone-of-cold', 5).allowed).toBe(true);
    });

    it('rejects when slot level is below spell level', () => {
      const p = makeParticipant(sc);
      const res = svc.canCast(p, 'cone-of-cold', 3);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('INSUFFICIENT_SPELL_SLOTS');
    });

    it('rejects when slot is exhausted', () => {
      const p = makeParticipant(sc, { byLevel: { 3: 3 } });
      const res = svc.canCast(p, 'fireball', 3);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('INSUFFICIENT_SPELL_SLOTS');
    });

    it('debits slot on cast', () => {
      const p = makeParticipant(sc, { byLevel: { 3: 1 } });
      svc.debit(p, 'fireball', 3);
      expect(p.spellSlotsUsed.byLevel[3]).toBe(2);
    });

    it('does not debit on cantrip', () => {
      const p = makeParticipant(sc, { byLevel: { 3: 0 } });
      svc.debit(p, 'fire-bolt', 0);
      expect(p.spellSlotsUsed.byLevel?.[3] ?? 0).toBe(0);
    });
  });

  describe('innate spellcasting (Dragon)', () => {
    const sc = {
      type: 'innate',
      ability: 'cha',
      saveDc: 21,
      attackBonus: 13,
      dailyUses: {
        'detect-magic': 'at-will',
        scrying: 'at-will',
        fireball: '3/day',
        'dominate-person': '1/day',
      },
      knownSpells: [
        { slug: 'detect-magic', level: 0 },
        { slug: 'scrying', level: 0 },
        { slug: 'fireball', level: 0 },
        { slug: 'dominate-person', level: 0 },
      ],
    };

    it('at-will is always castable', () => {
      const p = makeParticipant(sc);
      expect(svc.canCast(p, 'detect-magic', 0).allowed).toBe(true);
    });

    it('counts 3/day uses', () => {
      const p = makeParticipant(sc, { innateUses: { fireball: 2 } });
      const list = svc.getAvailability(p);
      const fb = list.find((s) => s.slug === 'fireball');
      expect(fb?.usesRemaining).toBe(1);
      expect(fb?.usage).toBe('3/day');
    });

    it('rejects when 1/day already used', () => {
      const p = makeParticipant(sc, { innateUses: { 'dominate-person': 1 } });
      const res = svc.canCast(p, 'dominate-person', 0);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('NO_USES_REMAINING');
    });

    it('debits innate use on cast', () => {
      const p = makeParticipant(sc);
      svc.debit(p, 'fireball', 0);
      expect(p.spellSlotsUsed.innateUses.fireball).toBe(1);
    });

    it('does not debit at-will innate', () => {
      const p = makeParticipant(sc);
      svc.debit(p, 'detect-magic', 0);
      expect(p.spellSlotsUsed.innateUses?.['detect-magic'] ?? 0).toBe(0);
    });
  });

  it('returns empty availability for non-casters', () => {
    const p = makeParticipant(null);
    expect(svc.getAvailability(p)).toEqual([]);
  });

  it('rejects casts for unknown spells', () => {
    const p = makeParticipant({
      type: 'standard',
      ability: 'int',
      saveDc: 15,
      attackBonus: 7,
      slotsByLevel: { 1: 1 },
      knownSpells: [{ slug: 'magic-missile', level: 1 }],
    });
    const res = p ? ({ allowed: true } as any) : { allowed: false };
    const check = svc.canCast(p, 'fireball', 3);
    expect(check.allowed).toBe(false);
    expect(check.code).toBe('INVALID_SPELL');
  });
});
