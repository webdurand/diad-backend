import { Injectable } from "@nestjs/common";
import { DiceService } from "./dice.service";





















export type FightingStyleSlug =
  | "archery"
  | "defense"
  | "dueling"
  | "great-weapon-fighting"
  | "interception"
  | "protection"
  | "thrown-weapon-fighting"
  | "two-weapon-fighting"
  | "unarmed-fighting"
  | "blind-fighting";

export interface AttackFightingStyleContext {
  fightingStyleSlug?: string | null;

  isMelee: boolean;

  isTwoHanded: boolean;

  isThrown: boolean;

  isOneHandNoOffhand: boolean;

  isOffhandAttack: boolean;

  abilityMod: number;

  isUnarmed: boolean;

  hasBothHandsFree: boolean;
}

export interface AttackFightingStyleResult {

  attackBonus: number;

  damageBonus: number;

  rerollLowDamage: boolean;

  unarmedDamageOverride?: { dice: string };

  appliedStyle?: FightingStyleSlug;
}

export interface AcFightingStyleContext {
  fightingStyleSlug?: string | null;

  hasArmor: boolean;
}

@Injectable()
export class FightingStyleService {
  constructor(private readonly dice: DiceService) {}


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
      case "archery":

        if (!ctx.isMelee && !ctx.isThrown) {
          return { ...empty, attackBonus: 2, appliedStyle: "archery" };
        }
        return empty;

      case "dueling":

        if (ctx.isMelee && ctx.isOneHandNoOffhand && !ctx.isTwoHanded) {
          return { ...empty, damageBonus: 2, appliedStyle: "dueling" };
        }
        return empty;

      case "great-weapon-fighting":

        if (ctx.isMelee && ctx.isTwoHanded) {
          return {
            ...empty,
            rerollLowDamage: true,
            appliedStyle: "great-weapon-fighting",
          };
        }
        return empty;

      case "thrown-weapon-fighting":

        if (ctx.isThrown) {
          return {
            ...empty,
            damageBonus: 2,
            appliedStyle: "thrown-weapon-fighting",
          };
        }
        return empty;

      case "two-weapon-fighting":

        if (ctx.isOffhandAttack && ctx.abilityMod > 0) {
          return {
            ...empty,
            damageBonus: ctx.abilityMod,
            appliedStyle: "two-weapon-fighting",
          };
        }
        return empty;

      case "unarmed-fighting": {


        if (!ctx.isUnarmed) return empty;
        const dice = ctx.hasBothHandsFree ? "1d8" : "1d6";
        return {
          ...empty,
          unarmedDamageOverride: { dice },
          appliedStyle: "unarmed-fighting",
        };
      }


      case "defense":
      case "blind-fighting":
      case "interception":
      case "protection":
        return empty;

      default:
        return empty;
    }
  }


  resolveAcBonus(ctx: AcFightingStyleContext): number {
    if (ctx.fightingStyleSlug === "defense" && ctx.hasArmor) return 1;
    return 0;
  }


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
    return {
      rolls: finalRolls,
      total: finalRolls.reduce((s, v) => s + v, 0),
      rerolled,
    };
  }
}
