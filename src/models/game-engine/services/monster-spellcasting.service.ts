import { Injectable } from '@nestjs/common';
import type {
  MonsterSpellcasting,
  SpellSlotLevel,
  ParticipantSpellSlotsUsed,
} from '../interfaces/monster-typed';
import type { EncounterParticipantEntity } from '../../../entities/encounter-participant.entity';

export interface MonsterSpellAvailability {
  slug: string;
  level: number;
  slotRemaining?: number;
  usesRemaining?: number;
  usage?: 'at-will' | '1/day' | '2/day' | '3/day';
}

export interface MonsterCastCheck {
  allowed: boolean;
  code?: 'INVALID_SPELL' | 'INSUFFICIENT_SPELL_SLOTS' | 'NO_USES_REMAINING';
  message?: string;
}

/**
 * Tracks monster spellcasting resources per encounter.
 * Stateless: reads `monster.spellcasting` and `participant.spellSlotsUsed`.
 * Callers must persist `participant.spellSlotsUsed` after calling `debit`.
 */
@Injectable()
export class MonsterSpellcastingService {
  getAvailability(
    participant: EncounterParticipantEntity,
  ): MonsterSpellAvailability[] {
    const sc: MonsterSpellcasting | null = (participant.monster as any)?.spellcasting ?? null;
    if (!sc) return [];
    const used: ParticipantSpellSlotsUsed = participant.spellSlotsUsed ?? {};

    return sc.knownSpells.map((ks) => {
      const result: MonsterSpellAvailability = { slug: ks.slug, level: ks.level };
      if (sc.type === 'standard') {
        const level = ks.level as SpellSlotLevel;
        if (ks.level > 0) {
          const total = sc.slotsByLevel?.[level] ?? 0;
          const spent = used.byLevel?.[level] ?? 0;
          result.slotRemaining = Math.max(0, total - spent);
        }
      } else {
        const usage = sc.dailyUses?.[ks.slug];
        result.usage = usage;
        if (usage && usage !== 'at-will') {
          const max = parseInt(usage.split('/')[0], 10);
          const spent = used.innateUses?.[ks.slug] ?? 0;
          result.usesRemaining = Math.max(0, max - spent);
        }
      }
      return result;
    });
  }

  canCast(
    participant: EncounterParticipantEntity,
    spellSlug: string,
    slotLevel: number,
  ): MonsterCastCheck {
    const sc: MonsterSpellcasting | null = (participant.monster as any)?.spellcasting ?? null;
    if (!sc) return { allowed: false, code: 'INVALID_SPELL', message: 'Monstro não é caster.' };

    const known = sc.knownSpells.find((s) => s.slug === spellSlug);
    if (!known) {
      return {
        allowed: false,
        code: 'INVALID_SPELL',
        message: 'Magia não está na lista do monstro.',
      };
    }

    if (sc.type === 'standard') {
      if (known.level === 0) return { allowed: true };
      const level = slotLevel as SpellSlotLevel;
      if (level < known.level) {
        return {
          allowed: false,
          code: 'INSUFFICIENT_SPELL_SLOTS',
          message: `Essa magia precisa de slot nível ${known.level}+.`,
        };
      }
      const total = sc.slotsByLevel?.[level] ?? 0;
      const spent = participant.spellSlotsUsed?.byLevel?.[level] ?? 0;
      if (spent >= total) {
        return {
          allowed: false,
          code: 'INSUFFICIENT_SPELL_SLOTS',
          message: `Sem slots nível ${level} restantes.`,
        };
      }
      return { allowed: true };
    }

    const usage = sc.dailyUses?.[spellSlug];
    if (!usage) return { allowed: false, code: 'INVALID_SPELL', message: 'Uso não configurado.' };
    if (usage === 'at-will') return { allowed: true };
    const max = parseInt(usage.split('/')[0], 10);
    const spent = participant.spellSlotsUsed?.innateUses?.[spellSlug] ?? 0;
    if (spent >= max) {
      return {
        allowed: false,
        code: 'NO_USES_REMAINING',
        message: `${spellSlug} já usou os ${usage} disponíveis hoje.`,
      };
    }
    return { allowed: true };
  }

  debit(
    participant: EncounterParticipantEntity,
    spellSlug: string,
    slotLevel: number,
  ): void {
    const sc: MonsterSpellcasting | null = (participant.monster as any)?.spellcasting ?? null;
    if (!sc) return;

    const used: ParticipantSpellSlotsUsed = { ...(participant.spellSlotsUsed ?? {}) };

    if (sc.type === 'standard') {
      const known = sc.knownSpells.find((s) => s.slug === spellSlug);
      if (!known || known.level === 0) {
        participant.spellSlotsUsed = used;
        return;
      }
      const level = slotLevel as SpellSlotLevel;
      used.byLevel = { ...(used.byLevel ?? {}) };
      used.byLevel[level] = (used.byLevel[level] ?? 0) + 1;
    } else {
      const usage = sc.dailyUses?.[spellSlug];
      if (!usage || usage === 'at-will') {
        participant.spellSlotsUsed = used;
        return;
      }
      used.innateUses = { ...(used.innateUses ?? {}) };
      used.innateUses[spellSlug] = (used.innateUses[spellSlug] ?? 0) + 1;
    }

    participant.spellSlotsUsed = used;
  }
}
