/**
 * Typed structures for monster multiattack and spellcasting.
 * Persisted as jsonb in `monsters.multiattack` / `monsters.spellcasting`.
 * Populated by data migrations from SRD free-text descriptions.
 */

export type SpellSlotLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface MonsterMultiattackSubAttack {
  actionName: string;
  count: number;
  requireDistinctTargets?: boolean;
  recharge?: "5-6" | "6";
}

export interface MonsterMultiattack {
  sequence: MonsterMultiattackSubAttack[];
  description: string;
}

export type InnateUsage = "at-will" | "1/day" | "2/day" | "3/day";

export interface MonsterKnownSpell {
  slug: string;
  level: number;
}

export interface MonsterSpellcasting {
  type: "standard" | "innate";
  ability: "int" | "wis" | "cha";
  saveDc: number;
  attackBonus: number;
  casterLevel?: number;
  slotsByLevel?: Partial<Record<SpellSlotLevel, number>>;
  dailyUses?: Record<string, InnateUsage>;
  knownSpells: MonsterKnownSpell[];
}

/**
 * Runtime-only state tracked per encounter participant (monster or PC).
 * Persisted as `encounter_participants.spell_slots_used`.
 */
export interface ParticipantSpellSlotsUsed {
  byLevel?: Partial<Record<SpellSlotLevel, number>>;
  innateUses?: Record<string, number>;
}
