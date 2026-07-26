import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { PersistentAreaEffectEntity } from "src/entities/persistent-area-effect.entity";
import { SpellEntity } from "src/entities/spell.entity";
import type {
  ConditionInstance,
  EffectInstance,
} from "../interfaces/combat.interfaces";
import type { GameEventData } from "../interfaces/result.type";
import { failure, success, type GameResult } from "../interfaces/result.type";
import { chebyshevDistanceFt } from "./combat-range";
import { ConcentrationService } from "./concentration.service";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { DiceService } from "./dice.service";
import { EffectInstanceService } from "./effect-instance.service";
import { TransformationService } from "./transformation.service";

export type DispelMagicTarget =
  | { kind: "participant"; participantId: string }
  | { kind: "tile-effect"; areaId: string };

export interface PreparedDispelMagicTarget {
  target: DispelMagicTarget;
  label: string;
}

export type DispelMagicOutcome =
  | "dispelled_automatic"
  | "dispelled_check"
  | "check_failed";

export interface DispelMagicEffectResult {
  effectId: string;
  effectKind:
    | "condition"
    | "effect-instance"
    | "transformation"
    | "tile-effect";
  sourceSpellSlug: string;
  spellLevel: number;
  roll: number | null;
  modifier: number;
  dc: number | null;
  total: number | null;
  outcome: DispelMagicOutcome;
  removed: boolean;
}

export interface DispelMagicResolution {
  target: DispelMagicTarget & { label: string };
  castAtSlotLevel: number;
  spellcastingModifier: number;
  noEffect: boolean;
  effects: DispelMagicEffectResult[];
}

interface OngoingSpellGroup {
  key: string;
  sourceSpellSlug: string;
  sourceCasterParticipantId: string | null;
  spellLevel: number;
  requiresConcentration: boolean;
  conditions: ConditionInstance[];
  effects: EffectInstance[];
  transformation: boolean;
}

function normalizeSpellSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/-(phb|xphb|srd52)$/, "");
}

function transformationSpellSlug(source: string | undefined): string | null {
  switch (source) {
    case "polymorph-spell":
      return "polymorph";
    case "true-polymorph-spell":
      return "true-polymorph";
    case "shapechange-spell":
      return "shapechange";
    case "alter-self-spell":
      return "alter-self";
    case "draconic-transformation":
      return "draconic-transformation";
    default:
      return null;
  }
}

@Injectable()
export class DispelMagicService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    @InjectRepository(PersistentAreaEffectEntity)
    private readonly areas: Repository<PersistentAreaEffectEntity>,
    @InjectRepository(SpellEntity)
    private readonly spells: Repository<SpellEntity>,
    private readonly dice: DiceService,
    private readonly conditions: ConditionLifecycleService,
    private readonly effects: EffectInstanceService,
    private readonly concentration: ConcentrationService,
    private readonly transformation: TransformationService,
  ) {}

  async prepareTarget(input: {
    encounterId: string;
    caster: EncounterParticipantEntity;
    target: DispelMagicTarget | undefined;
    rangeFt?: number;
  }): Promise<GameResult<PreparedDispelMagicTarget>> {
    if (!input.target) {
      return failure(
        "Dispel Magic exige escolher exatamente uma criatura ou efeito mágico.",
        "INVALID_TARGET",
      );
    }
    const rangeFt = input.rangeFt ?? 120;
    if (input.caster.positionX == null || input.caster.positionY == null) {
      return failure(
        "O conjurador precisa estar posicionado para validar o alcance de Dispel Magic.",
        "INVALID_TARGET",
      );
    }
    const casterCell = {
      x: input.caster.positionX,
      y: input.caster.positionY,
    };

    if (input.target.kind === "participant") {
      const target = await this.participants.findOne({
        where: {
          id: input.target.participantId,
          encounterId: input.encounterId,
        },
      });
      if (!target) {
        return failure("Criatura alvo inválida.", "INVALID_TARGET");
      }
      if (target.positionX == null || target.positionY == null) {
        return failure(
          "A criatura alvo precisa estar posicionada no mapa.",
          "INVALID_TARGET",
        );
      }
      const distanceFt = chebyshevDistanceFt(casterCell, {
        x: target.positionX,
        y: target.positionY,
      });
      if (distanceFt > rangeFt) {
        return failure(
          `Alvo fora do alcance (${distanceFt}ft > ${rangeFt}ft).`,
          "SPELL_OUT_OF_RANGE",
        );
      }
      return success({
        target: input.target,
        label: target.displayName,
      });
    }

    const area = await this.areas.findOne({
      where: { id: input.target.areaId, encounterId: input.encounterId },
    });
    if (!area) {
      return failure("Efeito mágico de mapa inválido.", "INVALID_TARGET");
    }
    const distanceFt = chebyshevDistanceFt(casterCell, area.originCell);
    if (distanceFt > rangeFt) {
      return failure(
        `Efeito mágico fora do alcance (${distanceFt}ft > ${rangeFt}ft).`,
        "SPELL_OUT_OF_RANGE",
      );
    }
    return success({
      target: input.target,
      label: area.narrativeDescriptor || area.sourceSpell,
    });
  }

  async resolve(input: {
    encounterId: string;
    prepared: PreparedDispelMagicTarget;
    castAtSlotLevel: number;
    spellcastingModifier: number;
    casterParticipantId: string;
  }): Promise<{
    resolution: DispelMagicResolution;
    events: GameEventData[];
  }> {
    const events: GameEventData[] = [];
    const results =
      input.prepared.target.kind === "participant"
        ? await this.resolveParticipant(input, events)
        : await this.resolveArea(input, events);
    const resolution: DispelMagicResolution = {
      target: {
        ...input.prepared.target,
        label: input.prepared.label,
      },
      castAtSlotLevel: input.castAtSlotLevel,
      spellcastingModifier: input.spellcastingModifier,
      noEffect: results.length === 0,
      effects: results,
    };
    if (results.length === 0) {
      events.push({
        event_type: "dispel_magic_no_effect",
        actor_participant_id: input.casterParticipantId,
        target_participant_id:
          input.prepared.target.kind === "participant"
            ? input.prepared.target.participantId
            : undefined,
        data: {
          target: resolution.target,
          castAtSlotLevel: input.castAtSlotLevel,
          reason: "no_ongoing_spell",
        },
      });
    }
    return { resolution, events };
  }

  private async resolveParticipant(
    input: {
      encounterId: string;
      prepared: PreparedDispelMagicTarget;
      castAtSlotLevel: number;
      spellcastingModifier: number;
      casterParticipantId: string;
    },
    events: GameEventData[],
  ): Promise<DispelMagicEffectResult[]> {
    if (input.prepared.target.kind !== "participant") return [];
    const target = await this.participants.findOne({
      where: {
        id: input.prepared.target.participantId,
        encounterId: input.encounterId,
      },
    });
    if (!target) return [];
    const groups = await this.collectOngoingSpells(target);
    const results: DispelMagicEffectResult[] = [];
    for (const group of groups) {
      const check = this.checkSpell(
        group.spellLevel,
        input.castAtSlotLevel,
        input.spellcastingModifier,
      );
      let removed = false;
      if (check.succeeded) {
        removed = await this.removeGroup(target, group, events);
      }
      const result: DispelMagicEffectResult = {
        effectId: group.key,
        effectKind: group.transformation
          ? "transformation"
          : group.conditions.length > 0
            ? "condition"
            : "effect-instance",
        sourceSpellSlug: group.sourceSpellSlug,
        spellLevel: group.spellLevel,
        roll: check.roll,
        modifier: input.spellcastingModifier,
        dc: check.dc,
        total: check.total,
        outcome: check.outcome,
        removed,
      };
      results.push(result);
      events.push(
        this.resolutionEvent(
          input.casterParticipantId,
          target.id,
          input.castAtSlotLevel,
          result,
        ),
      );
    }
    return results;
  }

  private async resolveArea(
    input: {
      encounterId: string;
      prepared: PreparedDispelMagicTarget;
      castAtSlotLevel: number;
      spellcastingModifier: number;
      casterParticipantId: string;
    },
    events: GameEventData[],
  ): Promise<DispelMagicEffectResult[]> {
    if (input.prepared.target.kind !== "tile-effect") return [];
    const area = await this.areas.findOne({
      where: {
        id: input.prepared.target.areaId,
        encounterId: input.encounterId,
      },
    });
    if (!area) return [];
    const spellLevel = await this.resolveSpellLevel(
      area.sourceSpell,
      area.slotLevel,
    );
    const check = this.checkSpell(
      spellLevel,
      input.castAtSlotLevel,
      input.spellcastingModifier,
    );
    let removed = false;
    if (check.succeeded) {
      const sourceCaster = area.casterParticipantId
        ? await this.participants.findOne({
            where: { id: area.casterParticipantId },
          })
        : null;
      if (
        area.sourceConcentration &&
        sourceCaster?.isConcentrating &&
        normalizeSpellSlug(sourceCaster.concentratingOn ?? "") ===
          normalizeSpellSlug(area.sourceSpell)
      ) {
        const broken = await this.concentration.break(
          sourceCaster,
          "dispel_magic",
        );
        events.push(...broken.events);
        removed = true;
      } else {
        await this.areas.delete({ id: area.id });
        removed = true;
        events.push({
          event_type: "tile_effect_removed",
          actor_participant_id: input.casterParticipantId,
          data: {
            areaId: area.id,
            sourceSpell: area.sourceSpell,
            effectKind: area.effectKind,
            reason: "dispel_magic",
            narrativeDescriptor: area.narrativeDescriptor,
          },
        });
      }
      await this.cleanupAreaBindings(area, events);
    }
    const result: DispelMagicEffectResult = {
      effectId: area.id,
      effectKind: "tile-effect",
      sourceSpellSlug: normalizeSpellSlug(area.sourceSpell),
      spellLevel,
      roll: check.roll,
      modifier: input.spellcastingModifier,
      dc: check.dc,
      total: check.total,
      outcome: check.outcome,
      removed,
    };
    events.push(
      this.resolutionEvent(
        input.casterParticipantId,
        undefined,
        input.castAtSlotLevel,
        result,
      ),
    );
    return [result];
  }

  private async collectOngoingSpells(
    target: EncounterParticipantEntity,
  ): Promise<OngoingSpellGroup[]> {
    const byKey = new Map<string, OngoingSpellGroup>();
    const getGroup = async (
      sourceSpell: string,
      sourceCasterParticipantId: string | null,
      explicitLevel: number | undefined,
    ) => {
      const slug = normalizeSpellSlug(sourceSpell);
      const key = `${sourceCasterParticipantId ?? "unknown"}:${slug}`;
      let group = byKey.get(key);
      if (!group) {
        group = {
          key,
          sourceSpellSlug: slug,
          sourceCasterParticipantId,
          spellLevel: await this.resolveSpellLevel(slug, explicitLevel),
          requiresConcentration: false,
          conditions: [],
          effects: [],
          transformation: false,
        };
        byKey.set(key, group);
      } else if (
        typeof explicitLevel === "number" &&
        explicitLevel > group.spellLevel
      ) {
        group.spellLevel = explicitLevel;
      }
      return group;
    };

    for (const condition of target.conditionInstances ?? []) {
      if (!condition.sourceSpell) continue;
      const group = await getGroup(
        condition.sourceSpell,
        condition.appliedBy,
        condition.level,
      );
      group.conditions.push(condition);
      group.requiresConcentration ||= condition.sourceConcentration;
    }
    for (const effect of target.effectInstances ?? []) {
      if (
        !effect.sourceSpellSlug ||
        effect.kind === "tile_effect_entry_marker" ||
        effect.kind === "tile_effect_turn_trigger_marker"
      ) {
        continue;
      }
      const group = await getGroup(
        effect.sourceSpellSlug,
        effect.sourceCasterParticipantId,
        effect.payload?.slotLevel,
      );
      group.effects.push(effect);
      group.requiresConcentration ||= effect.requiresConcentration;
    }

    const transformSlug = transformationSpellSlug(
      target.transformationState?.source,
    );
    if (transformSlug) {
      const group = await getGroup(
        transformSlug,
        target.transformationState?.sourceCasterParticipantId ?? null,
        undefined,
      );
      group.transformation = true;
      group.requiresConcentration ||=
        target.transformationState?.revertTriggers?.concentrationBroken ===
        true;
    }
    return [...byKey.values()];
  }

  private async removeGroup(
    target: EncounterParticipantEntity,
    group: OngoingSpellGroup,
    events: GameEventData[],
  ): Promise<boolean> {
    if (group.requiresConcentration && group.sourceCasterParticipantId) {
      const caster = await this.participants.findOne({
        where: { id: group.sourceCasterParticipantId },
      });
      if (
        caster?.isConcentrating &&
        normalizeSpellSlug(caster.concentratingOn ?? "") ===
          group.sourceSpellSlug
      ) {
        const broken = await this.concentration.break(caster, "dispel_magic");
        events.push(...broken.events);
        return true;
      }
    }

    let removed = false;
    for (const condition of group.conditions) {
      const result = await this.conditions.removeConditionInstance(
        target,
        condition.id,
        "dispel_magic",
      );
      events.push(...result.events);
      removed ||= result.removed;
    }
    for (const effect of group.effects) {
      const result = await this.effects.removeEffect(
        target,
        effect.id,
        "manual",
      );
      events.push(...result.events);
      removed ||= result.removed;
    }
    if (group.transformation && target.transformationState) {
      const formName = target.transformationState.form.formName;
      await this.transformation.revertForm(target.id, "dispel-magic");
      events.push({
        event_type: "transformation_reverted",
        target_participant_id: target.id,
        data: {
          reason: "dispel_magic",
          formName,
          sourceSpell: group.sourceSpellSlug,
        },
      });
      removed = true;
    }
    return removed;
  }

  private async cleanupAreaBindings(
    area: PersistentAreaEffectEntity,
    events: GameEventData[],
  ): Promise<void> {
    const participants = await this.participants.find({
      where: { encounterId: area.encounterId },
    });
    const sourceSpell = normalizeSpellSlug(area.sourceSpell);
    for (const participant of participants) {
      for (const condition of [...(participant.conditionInstances ?? [])]) {
        if (
          condition.sourceSpell &&
          normalizeSpellSlug(condition.sourceSpell) === sourceSpell &&
          condition.appliedBy === area.casterParticipantId
        ) {
          const removed = await this.conditions.removeConditionInstance(
            participant,
            condition.id,
            "dispel_magic",
          );
          events.push(...removed.events);
        }
      }
      for (const effect of [...(participant.effectInstances ?? [])]) {
        if (
          effect.payload?.areaId === area.id &&
          (effect.kind === "tile_effect_entry_marker" ||
            effect.kind === "tile_effect_turn_trigger_marker")
        ) {
          const removed = await this.effects.removeEffect(
            participant,
            effect.id,
            "manual",
          );
          events.push(...removed.events);
        }
      }
    }
  }

  private checkSpell(
    spellLevel: number,
    castAtSlotLevel: number,
    modifier: number,
  ): {
    succeeded: boolean;
    roll: number | null;
    dc: number | null;
    total: number | null;
    outcome: DispelMagicOutcome;
  } {
    if (spellLevel <= castAtSlotLevel) {
      return {
        succeeded: true,
        roll: null,
        dc: null,
        total: null,
        outcome: "dispelled_automatic",
      };
    }
    const roll = this.dice.roll(20);
    const dc = 10 + spellLevel;
    const total = roll + modifier;
    const succeeded = total >= dc;
    return {
      succeeded,
      roll,
      dc,
      total,
      outcome: succeeded ? "dispelled_check" : "check_failed",
    };
  }

  private async resolveSpellLevel(
    sourceSpell: string,
    explicitLevel: number | null | undefined,
  ): Promise<number> {
    if (
      typeof explicitLevel === "number" &&
      Number.isFinite(explicitLevel) &&
      explicitLevel > 0
    ) {
      return explicitLevel;
    }
    const normalized = normalizeSpellSlug(sourceSpell);
    const spell = await this.spells.findOne({
      where: [
        { slug: sourceSpell },
        { slug: normalized },
        { slug: `${normalized}-xphb` },
        { slug: `${normalized}-phb` },
        { slug: `${normalized}-srd52` },
      ],
    });
    return Math.max(0, spell?.level ?? 0);
  }

  private resolutionEvent(
    casterParticipantId: string,
    targetParticipantId: string | undefined,
    castAtSlotLevel: number,
    result: DispelMagicEffectResult,
  ): GameEventData {
    return {
      event_type: "dispel_magic_resolved",
      actor_participant_id: casterParticipantId,
      target_participant_id: targetParticipantId,
      data: {
        ...result,
        castAtSlotLevel,
      },
    };
  }
}
