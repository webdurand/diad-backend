import type { AddEffectInput } from "./effect-instance.service";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";



export interface MaterializeContext {

  casterParticipantId: string;

  targetParticipantIds: string[];

  editionCode?: string;

  slotLevel: number;

  casterDexModifier?: number;

  wasConcentrating?: boolean;
}

export interface SpellEffectMaterialization {
  targetParticipantId: string;
  input: AddEffectInput;
}


export interface TargetMetadata {
  id: string;

  isWearingArmor: boolean;
  participant?: EncounterParticipantEntity;
}

export interface PreconditionFailure {
  code: string;
  message: string;
  targetId?: string;
}


export function checkSpellPreconditions(
  spellSlug: string,
  targets: TargetMetadata[],
): PreconditionFailure | null {
  const slug = spellSlug.toLowerCase();

  if (slug === "mage-armor") {

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


export function materializeSpellEffects(
  spellSlug: string,
  ctx: MaterializeContext,
): SpellEffectMaterialization[] {
  const slug = spellSlug.toLowerCase();

  switch (slug) {
    case "shield": {



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





      const target = ctx.targetParticipantIds[0] ?? ctx.casterParticipantId;
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "ac_bonus",
            sourceSpellSlug: "mage-armor",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 3 },


            expiresAt: { kind: "end_of_encounter" },
            requiresConcentration: false,
          },
        },
      ];
    }


    case "blur": {

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
