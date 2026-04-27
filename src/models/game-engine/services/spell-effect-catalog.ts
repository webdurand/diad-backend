import type { AddEffectInput } from "./effect-instance.service";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";

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

  if (slug === "mage-armor") {
    // RAW: "You touch a willing creature who isn't wearing armor."
    const armored = targets.find((t) => t.isWearingArmor);
    if (armored) {
      return {
        code: "INVALID_SPELL_TARGET",
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
    case "shield": {
      // RAW Shield: "+5 bonus to AC, including against the triggering attack,
      //  until the start of your next turn."
      // Self-target (caster). Reaction.
      return [
        {
          targetParticipantId: ctx.casterParticipantId,
          input: {
            kind: "ac_bonus",
            sourceSpellSlug: "shield",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 5 },
            expiresAt: { kind: "until_caster_turn", value: 1 },
            requiresConcentration: false,
          },
        },
      ];
    }
    case "bless": {
      // RAW Bless: escolhe até 3 alvos. Por 1 min (concentration), +1d4 em
      // attack rolls e saving throws.
      const out: SpellEffectMaterialization[] = [];
      for (const tid of ctx.targetParticipantIds.slice(0, 3)) {
        out.push({
          targetParticipantId: tid,
          input: {
            kind: "attack_bonus",
            sourceSpellSlug: "bless",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { diceExpression: "1d4" },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        });
        out.push({
          targetParticipantId: tid,
          input: {
            kind: "save_bonus",
            sourceSpellSlug: "bless",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { diceExpression: "1d4" },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        });
      }
      return out;
    }
    case "bane": {
      // RAW Bane: até 3 alvos (CHA save na cast; falha → -1d4 em attack/save por 1 min,
      // concentration). Materialização aplica a TODOS os alvos — o save é resolvido
      // pela spell-casting.service ANTES de chamar materialize. Aqui só materializamos
      // quem falhou (catálogo delega seleção ao caller; MVP aplica em todos os targetIds).
      const out: SpellEffectMaterialization[] = [];
      for (const tid of ctx.targetParticipantIds.slice(0, 3)) {
        out.push({
          targetParticipantId: tid,
          input: {
            kind: "attack_penalty",
            sourceSpellSlug: "bane",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { diceExpression: "1d4" },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        });
        out.push({
          targetParticipantId: tid,
          input: {
            kind: "save_penalty",
            sourceSpellSlug: "bane",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { diceExpression: "1d4" },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        });
      }
      return out;
    }
    case "guiding-bolt": {
      // RAW: "Make a ranged spell attack against the creature" — on hit, 4d6 radiant
      // + "until the end of your next turn, the next attack roll made against
      //   this target by an attacker other than you has advantage."
      // Simplificacao MVP: assume hit (o damage resolver da spell-casting.service
      // ainda aplica damage sem attack roll; spec 005 adiciona attack roll).
      const target = ctx.targetParticipantIds[0];
      if (!target) return [];
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "grant_advantage_to_attackers",
            sourceSpellSlug: "guiding-bolt",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: {},
            expiresAt: { kind: "until_consumed", value: 1 },
            requiresConcentration: false,
          },
        },
      ];
    }
    case "mage-armor": {
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
            kind: "ac_bonus",
            sourceSpellSlug: "mage-armor",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 3 },
            // Mage Armor duracao: 8 horas = 4800 rounds (6s/round). Usamos
            // 'end_of_encounter' na pratica, ja que combate nunca dura 8h.
            expiresAt: { kind: "end_of_encounter" },
            requiresConcentration: false,
          },
        },
      ];
    }
    // ── Spec 005 Addendum — Concentration buffs ────────────────────

    case "blur": {
      // RAW: Attackers have disadvantage on attack rolls vs you. Concentration, 1 min.
      return [
        {
          targetParticipantId: ctx.casterParticipantId,
          input: {
            kind: "grant_disadvantage_to_attackers",
            sourceSpellSlug: "blur",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: {},
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
      ];
    }

    case "invisibility": {
      // RAW: Target invisible. Attacks against have disadvantage, attacks by have advantage.
      // Concentration, 1 hour. Breaking on attack/spell not tracked mechanically in MVP.
      const target = ctx.targetParticipantIds[0] ?? ctx.casterParticipantId;
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "grant_disadvantage_to_attackers",
            sourceSpellSlug: "invisibility",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: {},
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
        {
          targetParticipantId: target,
          input: {
            kind: "self_advantage",
            sourceSpellSlug: "invisibility",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { scope: "melee" },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
      ];
    }

    case "greater-invisibility": {
      // RAW: Same as invisibility but doesn't end on attack/spell.
      const target = ctx.targetParticipantIds[0] ?? ctx.casterParticipantId;
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "grant_disadvantage_to_attackers",
            sourceSpellSlug: "greater-invisibility",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: {},
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
        {
          targetParticipantId: target,
          input: {
            kind: "self_advantage",
            sourceSpellSlug: "greater-invisibility",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { scope: "any" },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
      ];
    }

    case "haste": {
      // RAW: +2 AC, doubled speed, extra action (limited). Concentration, 1 min.
      const target = ctx.targetParticipantIds[0] ?? ctx.casterParticipantId;
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "ac_bonus",
            sourceSpellSlug: "haste",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 2 },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
        {
          targetParticipantId: target,
          input: {
            kind: "speed_multiplier",
            sourceSpellSlug: "haste",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 2 },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
        {
          targetParticipantId: target,
          input: {
            kind: "extra_action",
            sourceSpellSlug: "haste",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 1 },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
      ];
    }

    case "fly": {
      // RAW: Target gains 60 ft flying speed. Concentration, 10 min.
      const target = ctx.targetParticipantIds[0] ?? ctx.casterParticipantId;
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "flight_speed",
            sourceSpellSlug: "fly",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 60 },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
      ];
    }

    case "fire-shield": {
      // RAW: Resistance fire or cold (caster choice), retaliatory damage.
      // No concentration. Duration 10 min = 100 rounds.
      return [
        {
          targetParticipantId: ctx.casterParticipantId,
          input: {
            kind: "damage_resistance",
            sourceSpellSlug: "fire-shield",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { damageTypes: ["fire", "cold"] },
            expiresAt: { kind: "rounds", value: 100 },
            requiresConcentration: false,
          },
        },
      ];
    }

    case "globe-of-invulnerability": {
      // RAW: Immune to spells of 5th level or lower. Concentration, 1 min.
      return [
        {
          targetParticipantId: ctx.casterParticipantId,
          input: {
            kind: "damage_immunity_threshold",
            sourceSpellSlug: "globe-of-invulnerability",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 5 },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
      ];
    }

    case "true-seeing": {
      // RAW: Truesight 120 ft. No concentration. Duration 1 hour = 600 rounds.
      const target = ctx.targetParticipantIds[0] ?? ctx.casterParticipantId;
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "true_sight",
            sourceSpellSlug: "true-seeing",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 120 },
            expiresAt: { kind: "rounds", value: 600 },
            requiresConcentration: false,
          },
        },
      ];
    }

    case "hex": {
      // RAW 2024 XPHB Hex: 1 target, concentração 1h. Attacker deals extra 1d6 necrotic
      // em qualquer weapon attack que hit no target enquanto hex mantém.
      // Bonus action cast. Damage type: necrotic. Target ability check disadvantage (one chosen).
      const target = ctx.targetParticipantIds[0];
      if (!target) return [];
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "hex_mark",
            sourceSpellSlug: "hex",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { riderDice: "1d6", riderType: "necrotic" },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
      ];
    }
    case "hunters-mark":
    case "hunter-mark": {
      // RAW 2024 XPHB Hunter's Mark: 1 target, concentração 1h. Attacker deals
      // extra 1d6 em cada weapon attack hit no target enquanto marca mantém.
      // Bonus action cast. No damage type increase (damage type do weapon).
      const target = ctx.targetParticipantIds[0];
      if (!target) return [];
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "hunter_mark",
            sourceSpellSlug: "hunters-mark",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { riderDice: "1d6" },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
      ];
    }

    default:
      return [];
  }
}
