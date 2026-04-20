import { Injectable } from '@nestjs/common';
import { DiceService } from './dice.service';

// Spec 012 Fase 0 — Fighting Style (XPHB 2024)
//
// 10 estilos RAW: archery, defense, dueling, great-weapon-fighting, interception,
// protection, thrown-weapon-fighting, two-weapon-fighting, unarmed-fighting,
// blind-fighting.
//
// Tier A (passive/on-attack modifiers — implementado aqui):
//   - archery: +2 attack ranged
//   - defense: +1 AC (while wearing armor)
//   - dueling: +2 damage em 1h melee (offhand livre)
//   - great-weapon-fighting: reroll dano 1/2 em 2h weapon (aceitar novo roll)
//   - thrown-weapon-fighting: +2 damage em thrown attack
//   - two-weapon-fighting: add ability mod no offhand damage
//   - unarmed-fighting: unarmed damage d6 (d8 se 2 mãos livres)
//
// Tier B deferred (precisam reaction UI ou passive sem attack):
//   - interception: reaction reduz dano aliado adjacente em 1d10+PB
//   - protection: reaction disadvantage em atacante de aliado adjacente
//   - blind-fighting: blindsight 10ft (afeta targeting, não attack roll)

export type FightingStyleSlug =
  | 'archery'
  | 'defense'
  | 'dueling'
  | 'great-weapon-fighting'
  | 'interception'
  | 'protection'
  | 'thrown-weapon-fighting'
  | 'two-weapon-fighting'
  | 'unarmed-fighting'
  | 'blind-fighting';

export interface AttackFightingStyleContext {
  fightingStyleSlug?: string | null;
  /** Ataque melee (true) ou ranged (false). Unarmed é melee. */
  isMelee: boolean;
  /** Peso da arma 2-handed (great-weapon-fighting trigger). */
  isTwoHanded: boolean;
  /** Propriedade "thrown" na arma (thrown-weapon-fighting trigger). */
  isThrown: boolean;
  /** Atacante usando arma em 1 mão + offhand livre (dueling trigger). */
  isOneHandNoOffhand: boolean;
  /** Ataque é offhand TWF? (two-weapon-fighting trigger). */
  isOffhandAttack: boolean;
  /** Ability mod base (geralmente STR ou DEX). Usado p/ TWF. */
  abilityMod: number;
  /** Unarmed strike? (unarmed-fighting trigger). */
  isUnarmed: boolean;
  /** Tem as 2 mãos livres (sem offhand)? Unarmed d8. */
  hasBothHandsFree: boolean;
}

export interface AttackFightingStyleResult {
  /** Bonus ao attack roll. */
  attackBonus: number;
  /** Bonus flat ao damage roll. */
  damageBonus: number;
  /** Se true, rola damage dice (1s e 2s rerolled uma vez, aceitar segundo roll). */
  rerollLowDamage: boolean;
  /** Override do damage die do unarmed strike (Unarmed Fighting). */
  unarmedDamageOverride?: { dice: string };
  /** Rastreamento p/ log. */
  appliedStyle?: FightingStyleSlug;
}

export interface AcFightingStyleContext {
  fightingStyleSlug?: string | null;
  /** Usando armadura (não unarmored, não sem armor). */
  hasArmor: boolean;
}

@Injectable()
export class FightingStyleService {
  constructor(private readonly dice: DiceService) {}

  /**
   * Resolve modificadores de attack/damage baseados no Fighting Style do atacante.
   * Chamado em combat.service.resolveAttack após determinar contexto da arma.
   */
  resolveAttackModifiers(
    ctx: AttackFightingStyleContext,
  ): AttackFightingStyleResult {
    const empty: AttackFightingStyleResult = {
      attackBonus: 0,
      damageBonus: 0,
      rerollLowDamage: false,
    };
    const slug = ctx.fightingStyleSlug as FightingStyleSlug | undefined | null;
    if (!slug) return empty;

    switch (slug) {
      case 'archery':
        // +2 attack roll com ranged weapons (não thrown; thrown tem style próprio)
        if (!ctx.isMelee && !ctx.isThrown) {
          return { ...empty, attackBonus: 2, appliedStyle: 'archery' };
        }
        return empty;

      case 'dueling':
        // +2 damage em 1-handed melee sem offhand (permitido escudo)
        if (ctx.isMelee && ctx.isOneHandNoOffhand && !ctx.isTwoHanded) {
          return { ...empty, damageBonus: 2, appliedStyle: 'dueling' };
        }
        return empty;

      case 'great-weapon-fighting':
        // Reroll 1s/2s em dano de 2h melee (aceitar novo roll uma vez).
        if (ctx.isMelee && ctx.isTwoHanded) {
          return { ...empty, rerollLowDamage: true, appliedStyle: 'great-weapon-fighting' };
        }
        return empty;

      case 'thrown-weapon-fighting':
        // +2 damage em thrown weapon (javelin, handaxe arremessada)
        if (ctx.isThrown) {
          return { ...empty, damageBonus: 2, appliedStyle: 'thrown-weapon-fighting' };
        }
        return empty;

      case 'two-weapon-fighting':
        // Adiciona ability mod ao dano do offhand attack (normalmente offhand não tem mod)
        if (ctx.isOffhandAttack && ctx.abilityMod > 0) {
          return { ...empty, damageBonus: ctx.abilityMod, appliedStyle: 'two-weapon-fighting' };
        }
        return empty;

      case 'unarmed-fighting': {
        // Unarmed vira d6 (d8 se 2 mãos livres). XPHB 2024: também pode dar
        // 1d4 grappled dano, mas por ora só override do damage die.
        if (!ctx.isUnarmed) return empty;
        const dice = ctx.hasBothHandsFree ? '1d8' : '1d6';
        return { ...empty, unarmedDamageOverride: { dice }, appliedStyle: 'unarmed-fighting' };
      }

      // Tier B deferred — sem modifier direto em attack
      case 'defense':
      case 'blind-fighting':
      case 'interception':
      case 'protection':
        return empty;

      default:
        return empty;
    }
  }

  /**
   * Resolve bonus de AC baseado no Fighting Style. Chamado em computeSheet quando
   * o char tem armadura. Só Defense aplica (+1).
   */
  resolveAcBonus(ctx: AcFightingStyleContext): number {
    if (ctx.fightingStyleSlug === 'defense' && ctx.hasArmor) return 1;
    return 0;
  }

  /**
   * Dado roll original de damage dice, se rerollLowDamage true, rerola uma vez
   * os que vieram ≤2 e aceita o resultado (mesmo se vier baixo de novo — RAW).
   * Retorna total final + breakdown.
   */
  applyRerollLowDamage(
    originalRolls: number[],
    dieSize: number,
  ): { rolls: number[]; total: number; rerolled: boolean } {
    let rerolled = false;
    const finalRolls = originalRolls.map((r) => {
      if (r <= 2) {
        rerolled = true;
        return this.dice.roll(dieSize);
      }
      return r;
    });
    return { rolls: finalRolls, total: finalRolls.reduce((s, v) => s + v, 0), rerolled };
  }
}
