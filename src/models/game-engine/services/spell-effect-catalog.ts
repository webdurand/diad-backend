import type { AddEffectInput } from "./effect-instance.service";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";



export interface MaterializeContext {

  casterParticipantId: string;

  targetParticipantIds: string[];

  editionCode?: string;

  slotLevel: number;

  casterDexModifier?: number;

  targetDexModifiers?: Record<string, number>;

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
  const slug = spellSlug
    .toLowerCase()
    .replace(/-(phb|xphb|srd52)$/, "");

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

  if (slug === "heal") {
    const invalidCreature = targets.find((target) => {
      const rawType = target.participant?.monster?.type as
        | string
        | { index?: string; name?: string }
        | undefined;
      const creatureType =
        typeof rawType === "string"
          ? rawType
          : (rawType?.index ?? rawType?.name ?? "");
      return ["construct", "undead"].includes(creatureType.toLowerCase());
    });
    if (invalidCreature) {
      return {
        code: "INVALID_SPELL_TARGET",
        message: "Heal não produz efeito em Constructos ou Mortos-vivos.",
        targetId: invalidCreature.id,
      };
    }
  }

  return null;
}


export function materializeSpellEffects(
  spellSlug: string,
  ctx: MaterializeContext,
): SpellEffectMaterialization[] {
  const slug = spellSlug
    .toLowerCase()
    .replace(/-(phb|xphb|srd52)$/, "");

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
    case "ray-of-frost": {
      const target = ctx.targetParticipantIds[0];
      if (!target) return [];
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "speed_reduction",
            sourceSpellSlug: "ray-of-frost",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 10 },
            expiresAt: { kind: "until_caster_turn", value: 1 },
            requiresConcentration: false,
          },
        },
      ];
    }
    case "chill-touch": {
      const target = ctx.targetParticipantIds[0];
      if (!target) return [];
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "healing_blocked",
            sourceSpellSlug: "chill-touch",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: {},
            // The 2024 spell lasts through the end of the caster's next turn.
            // The first decrement happens when the casting turn ends.
            expiresAt: { kind: "caster_turn_ends", value: 2 },
            requiresConcentration: false,
          },
        },
      ];
    }
    case "shocking-grasp": {
      const target = ctx.targetParticipantIds[0];
      if (!target) return [];
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "opportunity_attacks_blocked",
            sourceSpellSlug: "shocking-grasp",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: {},
            expiresAt: { kind: "until_target_turn", value: 1 },
            requiresConcentration: false,
          },
        },
      ];
    }
    case "mage-armor": {
      const target = ctx.targetParticipantIds[0] ?? ctx.casterParticipantId;
      const targetDexModifier =
        ctx.targetDexModifiers?.[target] ?? ctx.casterDexModifier ?? 0;
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "ac_base_override",
            sourceSpellSlug: "mage-armor",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 13 + targetDexModifier },
            expiresAt: { kind: "rounds", value: 4_800 },
            requiresConcentration: false,
          },
        },
      ];
    }
    case "shield-of-faith": {
      const target = ctx.targetParticipantIds[0] ?? ctx.casterParticipantId;
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "ac_bonus",
            sourceSpellSlug: "shield-of-faith",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount: 2 },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
      ];
    }
    case "protection-from-evil-and-good": {
      const target = ctx.targetParticipantIds[0] ?? ctx.casterParticipantId;
      return [
        {
          targetParticipantId: target,
          input: {
            kind: "protection_from_evil_good",
            sourceSpellSlug: "protection-from-evil-and-good",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: {
              creatureTypes: [
                "aberration",
                "celestial",
                "elemental",
                "fey",
                "fiend",
                "undead",
              ],
            },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        },
      ];
    }
    case "aid": {
      const amount = 5 * Math.max(1, ctx.slotLevel - 1);
      return Array.from(new Set(ctx.targetParticipantIds))
        .slice(0, 3)
        .map((targetParticipantId) => ({
          targetParticipantId,
          input: {
            kind: "hit_point_maximum_bonus",
            sourceSpellSlug: "aid",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: { amount, slotLevel: ctx.slotLevel },
            expiresAt: { kind: "rounds", value: 4_800 },
            requiresConcentration: false,
          },
        }));
    }
    case "beacon-of-hope": {
      return Array.from(new Set(ctx.targetParticipantIds)).map(
        (targetParticipantId) => ({
          targetParticipantId,
          input: {
            kind: "beacon_of_hope",
            sourceSpellSlug: "beacon-of-hope",
            sourceCasterParticipantId: ctx.casterParticipantId,
            payload: {},
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
          },
        }),
      );
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
