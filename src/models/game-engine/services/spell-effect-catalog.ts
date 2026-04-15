import type { AddEffectInput } from './effect-instance.service';
import type { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';

/**
 * Spec 004 — mapeamento de spellSlug → EffectInstance[] a materializar.
 *
 * Iterativo: comeca com Mage Armor (checkpoint 2). Proximos checkpoints
 * adicionam Bless, Guiding Bolt, Shield, etc.
 *
 * Spells fora do catalogo retornam [] — o cast continua funcionando (slot
 * consumido, evento emitido), apenas sem materializar EffectInstance.
 */

export interface MaterializeContext {
  /** Caster participant id. */
  casterParticipantId: string;
  /** Target participant ids do cast. */
  targetParticipantIds: string[];
  /** Spec usada — 'PHB 2014' ou 'XPHB 2024' (reservado para divergencias futuras). */
  editionCode?: string;
  /** Spell slot usado. */
  slotLevel: number;
  /** DEX modifier do caster (usado por Mage Armor). */
  casterDexModifier?: number;
  /** Se caster ja estava concentrando quando cast; usado para saber se vai substituir. */
  wasConcentrating?: boolean;
}

export interface SpellEffectMaterialization {
  targetParticipantId: string;
  input: AddEffectInput;
}

/**
 * Metadata per-target usada pelas pre-conditions (Mage Armor requer alvo sem
 * armadura, etc). Callers (spell-casting.service) precisam preencher isso
 * antes de chamar `checkPreconditions` ou `materializeSpellEffects`.
 */
export interface TargetMetadata {
  id: string;
  /** True se o alvo tem armor equipada (armor base>0). Monstros: true se AC vem de natural armor. */
  isWearingArmor: boolean;
  participant?: EncounterParticipantEntity;
}

export interface PreconditionFailure {
  code: string;
  message: string;
  targetId?: string;
}

/**
 * Valida pre-conditions mecanicas da spell. Retorna null se OK, ou um
 * PreconditionFailure descritivo para retornar 409 ao caller.
 */
export function checkSpellPreconditions(
  spellSlug: string,
  targets: TargetMetadata[],
): PreconditionFailure | null {
  const slug = spellSlug.toLowerCase();

  if (slug === 'mage-armor') {
    // RAW: "You touch a willing creature who isn't wearing armor."
    const armored = targets.find((t) => t.isWearingArmor);
    if (armored) {
      return {
        code: 'INVALID_SPELL_TARGET',
        message:
          "Mage Armor so pode ser castada em alvo sem armadura (RAW: 'creature who isn't wearing armor').",
        targetId: armored.id,
      };
    }
  }

  return null;
}

/**
 * Retorna os effects a materializar no cast. Array vazio se a spell
 * nao tem mapping (nao bloqueia o cast).
 */
export function materializeSpellEffects(
  spellSlug: string,
  ctx: MaterializeContext,
): SpellEffectMaterialization[] {
  const slug = spellSlug.toLowerCase();

  switch (slug) {
    case 'mage-armor': {
      // RAW: "Until the spell ends, the target's base AC becomes 13 + DEX mod."
      // Simplificacao: assume alvo unarmored (caso contrario, spell nao se aplica).
      // Base AC sem armor = 10 + DEX. Apos Mage Armor = 13 + DEX. Delta = +3.
      // Target: self (targetParticipantIds[0] === caster em 99% dos casos, mas
      // a spec permite "a willing creature") → usar o primeiro target.
      const target = ctx.targetParticipantIds[0] ?? ctx.casterParticipantId;
      return [
        {
          targetParticipantId: target,
          input: {
            kind: 'ac_bonus',
            sourceSpellSlug: 'mage-armor',
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 3 },
            // Mage Armor duracao: 8 horas = 4800 rounds (6s/round). Usamos
            // 'end_of_encounter' na pratica, ja que combate nunca dura 8h.
            expiresAt: { kind: 'end_of_encounter' },
            requiresConcentration: false,
          },
        },
      ];
    }
    default:
      return [];
  }
}
