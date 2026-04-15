import { Injectable } from '@nestjs/common';
import type { ActionResolver } from './action-resolver.interface';
import type {
  ActionDescriptor,
  ActionKind,
  DisabledReason,
  ParticipantContext,
} from '../../interfaces/combat-action.interfaces';

/**
 * Spec 003 — Unarmed Strike (XPHB 2024).
 *
 * Sempre disponível para todo PC. 3 modes via `options.mode`:
 *  - `damage`  → 1 + STR mod bludgeoning (RAW XPHB)
 *  - `grapple` → alvo Large ou menor; STR save DC 8+prof+STR
 *  - `shove`   → STR save; falha = push 5ft OU prone
 *
 * Disponibilidade respeita action economy. Monstros **não** recebem via este resolver
 * (monstros usam statblock actions); NPCs sim.
 */
@Injectable()
export class UnarmedStrikeResolver implements ActionResolver {
  readonly kind: ActionKind = 'attack';

  async list(ctx: ParticipantContext): Promise<ActionDescriptor[]> {
    if (ctx.type === 'monster') return [];
    return [this.build(ctx)];
  }

  async resolveSlug(
    ctx: ParticipantContext,
    slug: string,
  ): Promise<ActionDescriptor | null> {
    if (slug !== 'unarmed-strike') return null;
    if (ctx.type === 'monster') return null;
    return this.build(ctx);
  }

  private build(ctx: ParticipantContext): ActionDescriptor {
    const economy = ctx.actionEconomy;
    let available = true;
    let disabledReason: DisabledReason | undefined;

    if (this.isBlockedByCondition(ctx)) {
      available = false;
      disabledReason = 'PREREQUISITE_NOT_MET';
    } else if (economy) {
      if (!economy.isOnTurn) {
        available = false;
        disabledReason = 'NOT_YOUR_TURN';
      } else if (economy.attacksUsedThisTurn >= economy.attacksMaxThisTurn) {
        available = false;
        disabledReason = 'ACTION_ALREADY_USED';
      }
    }

    return {
      slug: 'unarmed-strike',
      displayName: 'Golpe Desarmado',
      kind: 'attack',
      actionCost: 'action',
      available,
      disabledReason,
      targetShape: 'single-creature',
      targetRange: 5,
      metadata: {
        damageDice: '1',
        damageType: 'bludgeoning',
        subOptions: ['damage', 'grapple', 'shove'],
        attacksRemainingThisTurn: economy
          ? Math.max(0, economy.attacksMaxThisTurn - economy.attacksUsedThisTurn)
          : undefined,
      },
    };
  }

  private isBlockedByCondition(ctx: ParticipantContext): boolean {
    if (!ctx.conditions || ctx.conditions.length === 0) return false;
    const blocking = new Set([
      'incapacitated',
      'paralyzed',
      'stunned',
      'unconscious',
      'petrified',
      'grappled', // can't attack grappler with ranged; still allow in MVP? RAW: grappled doesn't prevent attack
    ]);
    // RAW: grappled não bloqueia attack. Remover.
    blocking.delete('grappled');
    return ctx.conditions.some((c) => blocking.has(c.toLowerCase()));
  }
}
