import type { AddEffectInput } from './effect-instance.service';

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
