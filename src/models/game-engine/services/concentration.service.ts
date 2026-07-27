import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { PersistentAreaEffectEntity } from "src/entities/persistent-area-effect.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import type {
  AppliedEffect,
  ConditionInstance,
  ConditionSlug,
} from "../interfaces/combat.interfaces";
import type { GameEventData } from "../interfaces/result.type";
import { narrativeForConditionRemoval } from "./narrative-condition-removal";
import { randomUUID } from "crypto";

export type ConcentrationBreakReason =
  | "damage"
  | "incapacitated"
  | "replaced"
  | "expired"
  | "death"
  | "sleet_storm_failed_save"
  | "dispel_magic"
  | "manual";

const INCAPACITATING: ConditionSlug[] = [
  "incapacitated",
  "paralyzed",
  "petrified",
  "stunned",
  "unconscious",
  "hypnotized",
  "banished",
];


@Injectable()
export class ConcentrationService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    @InjectRepository(PersistentAreaEffectEntity)
    private readonly areas: Repository<PersistentAreaEffectEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounters: Repository<EncounterEntity>,
  ) {}


  async startNew(
    caster: EncounterParticipantEntity,
    spellName: string,
    durationRounds: number | null,
    saveDc: number | null,
  ): Promise<{ events: GameEventData[]; broken: boolean }> {
    const events: GameEventData[] = [];
    let broken = false;
    if (caster.isConcentrating) {
      const r = await this.break(caster, "replaced");
      events.push(...r.events);
      broken = true;
    }
    caster.isConcentrating = true;
    caster.concentratingOn = spellName;
    caster.concentrationRoundsRemaining = durationRounds;
    caster.concentrationSaveDc = saveDc;
    caster.appliedEffects = caster.appliedEffects ?? [];
    await this.participants.save(caster);
    events.push({
      event_type: "concentration_started",
      actor_participant_id: caster.id,
      data: { spellName, durationRounds, saveDc },
    });
    return { events, broken };
  }


  async trackAppliedEffect(
    caster: EncounterParticipantEntity,
    effect: AppliedEffect,
  ): Promise<void> {
    caster.appliedEffects = [...(caster.appliedEffects ?? []), effect];
    await this.participants.save(caster);
  }


  async break(
    caster: EncounterParticipantEntity,
    reason: ConcentrationBreakReason,
    manager?: EntityManager,
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    if (!caster.isConcentrating) {
      return { events };
    }
    const participants = manager
      ? manager.getRepository(EncounterParticipantEntity)
      : this.participants;
    const areas = manager
      ? manager.getRepository(PersistentAreaEffectEntity)
      : this.areas;
    const encounters = manager
      ? manager.getRepository(EncounterEntity)
      : this.encounters;
    const prev = caster.concentratingOn;
    const effects = caster.appliedEffects ?? [];
    const activeEncounter = await encounters.findOne({
      where: { id: caster.encounterId },
    });
    const activeParticipantId =
      activeEncounter?.turnOrder?.[activeEncounter.currentTurnIndex] ?? null;


    const targetIds = effects
      .filter((e) => e.kind === "condition" && e.targetParticipantId)
      .map((e) => e.targetParticipantId as string);
    const uniqueIds = Array.from(new Set(targetIds));
    const fetchedTargets = uniqueIds.length
      ? await participants.findByIds(uniqueIds)
      : [];
    const targets = uniqueIds
      .map((id) =>
        id === caster.id
          ? caster
          : fetchedTargets.find((target) => target.id === id),
      )
      .filter(
        (target): target is EncounterParticipantEntity => target != null,
      );

    for (const eff of effects) {
      if (eff.kind === "condition" && eff.targetParticipantId) {
        const tgt = targets.find((t) => t.id === eff.targetParticipantId);
        if (!tgt) continue;
        const removed = (tgt.conditionInstances ?? []).find(
          (ci) => ci.id === eff.refId,
        );
        const before = (tgt.conditionInstances ?? []).length;
        tgt.conditionInstances = (tgt.conditionInstances ?? []).filter(
          (ci) => ci.id !== eff.refId,
        );
        if (tgt.conditionInstances.length !== before) {

          tgt.conditions = this.deriveSlugs(tgt.conditionInstances);

          const slug = removed?.slug ?? null;
          const narrative = slug
            ? narrativeForConditionRemoval(slug, "concentration_broken")
            : "";
          events.push({
            event_type: "condition_removed",
            target_participant_id: tgt.id,
            data: {
              instanceId: eff.refId,
              slug,
              source: removed?.source ?? "manual",
              removalReason: "concentration_broken",
              narrativeDescriptor: narrative,
              reason: "concentration_broken",
            },
          });
        }
      } else if (eff.kind === "persistent-area") {



        const area = await areas.findOne({ where: { id: eff.refId } });
        await areas.delete({ id: eff.refId });
        events.push({
          event_type: area?.effectKind
            ? "tile_effect_concentration_broken"
            : "persistent_area_removed",
          data: {
            areaId: eff.refId,
            sourceSpell: area?.sourceSpell,
            effectKind: area?.effectKind,
            casterId: caster.id,
            reason,
            narrativeDescriptor: area?.narrativeDescriptor,
            tactical: area?.tacticalMetadata,
          },
        });
      } else if (eff.kind === "summon") {
        await this.resolveSummonConcentrationBreak(
          caster,
          eff,
          reason,
          events,
          participants,
          encounters,
        );
      }
    }
    if (targets.length) await participants.save(targets);





    const orphanAreas = await areas.find({
      where: { casterParticipantId: caster.id, sourceConcentration: true },
    });
    if (orphanAreas.length) {
      for (const a of orphanAreas) {

        const alreadyHandled = effects.some(
          (e) => e.kind === "persistent-area" && e.refId === a.id,
        );
        if (alreadyHandled) continue;
        events.push({
          event_type: a.effectKind
            ? "tile_effect_concentration_broken"
            : "persistent_area_removed",
          data: {
            areaId: a.id,
            sourceSpell: a.sourceSpell,
            effectKind: a.effectKind,
            casterId: caster.id,
            reason,
            narrativeDescriptor: a.narrativeDescriptor,
            tactical: a.tacticalMetadata,
          },
        });
      }
      await areas.delete(orphanAreas.map((a) => a.id));
    }





    const encounterParticipants = await participants.find({
      where: { encounterId: caster.encounterId },
    });
    for (const p of encounterParticipants) {
      const before = p.effectInstances ?? [];
      const removedConcentrationEffects = before.filter(
        (effect) =>
          effect.requiresConcentration &&
          effect.sourceCasterParticipantId === caster.id,
      );
      const kept = before.filter(
        (e) =>
          !(
            e.requiresConcentration && e.sourceCasterParticipantId === caster.id
          ),
      );
      if (kept.length !== before.length) {
        for (const e of before) {
          if (
            e.requiresConcentration &&
            e.sourceCasterParticipantId === caster.id
          ) {
            events.push({
              event_type: "effect_expired",
              target_participant_id: p.id,
              data: {
                effectId: e.id,
                reason: "concentration_broken",
                kind: e.kind,
              },
            });
          }
        }
        p.effectInstances = kept;
        const hasteEnded = removedConcentrationEffects.some(
          (effect) =>
            effect.kind === "extra_action" &&
            effect.sourceSpellSlug
              ?.toLowerCase()
              .replace(/-(phb|xphb|srd52)$/, "") === "haste",
        );
        if (
          hasteEnded &&
          !(p.conditionInstances ?? []).some(
            (condition) => condition.slug === "haste_lethargy",
          )
        ) {
          const condition: ConditionInstance = {
            id: randomUUID(),
            slug: "haste_lethargy",
            appliedBy: caster.id,
            sourceSpell: "haste",
            sourceConcentration: false,
            source: "spell:haste",
            saveAbility: null,
            saveDc: null,
            repeatSaveTiming: "end_of_turn",
            durationRoundsRemaining:
              activeParticipantId === p.id ? 2 : 1,
            appliedAt: new Date().toISOString(),
          };
          p.conditionInstances = [...(p.conditionInstances ?? []), condition];
          p.conditions = this.deriveSlugs(p.conditionInstances);
          events.push({
            event_type: "condition_applied",
            actor_participant_id: caster.id,
            target_participant_id: p.id,
            data: {
              instanceId: condition.id,
              slug: condition.slug,
              sourceSpell: "haste",
              durationTurns: condition.durationRoundsRemaining,
              reason: "haste_ended",
            },
          });
        }
        if (p.id === caster.id) {

          caster.effectInstances = kept;
          caster.conditionInstances = p.conditionInstances;
          caster.conditions = p.conditions;
        } else {
          await participants.save(p);
        }
      }



      const tState = p.transformationState;
      if (
        tState &&
        tState.sourceCasterParticipantId === caster.id &&
        tState.revertTriggers?.concentrationBroken
      ) {
        const formName = tState.form.formName;
        const originalDisplay = tState.original.displayName;
        p.displayName = originalDisplay;
        p.transformationState = null;
        await participants.save(p);
        events.push({
          event_type: "transformation_reverted",
          target_participant_id: p.id,
          actor_participant_id: caster.id,
          data: {
            reason: "concentration_broken",
            formName,
            source: tState.source,
          },
        });
      }
    }

    caster.isConcentrating = false;
    caster.concentratingOn = null;
    caster.concentrationRoundsRemaining = null;
    caster.concentrationSaveDc = null;
    caster.appliedEffects = [];
    await participants.save(caster);

    events.push({
      event_type: "concentration_lost",
      actor_participant_id: caster.id,
      data: { reason, spellName: prev },
    });
    return { events };
  }

  private async resolveSummonConcentrationBreak(
    caster: EncounterParticipantEntity,
    effect: AppliedEffect,
    reason: ConcentrationBreakReason,
    events: GameEventData[],
    participants: Repository<EncounterParticipantEntity>,
    encounters: Repository<EncounterEntity>,
  ): Promise<void> {
    const summon = await participants.findOne({
      where: { id: effect.refId },
    });
    if (!summon || summon.linkedCasterParticipantId !== caster.id) return;

    const behavior =
      effect.metadata?.concentrationBreakBehavior === "turn-hostile"
        ? "turn-hostile"
        : "dismiss";

    if (behavior === "turn-hostile") {
      summon.controlledBy = "ai";
      summon.faction = caster.faction === "ally" ? "enemy" : "ally";
      summon.linkedCasterParticipantId = null;
      await participants.save(summon);
      events.push({
        event_type: "summon_control_lost",
        actor_participant_id: caster.id,
        target_participant_id: summon.id,
        data: {
          reason,
          summonId: summon.id,
          displayName: summon.displayName,
          faction: summon.faction,
          controlledBy: summon.controlledBy,
        },
      });
      return;
    }

    await this.removeFromTurnOrder(summon, encounters);
    await participants.remove(summon);
    events.push({
      event_type: "summon_dismissed",
      actor_participant_id: caster.id,
      target_participant_id: summon.id,
      data: {
        reason,
        summonId: summon.id,
        displayName: summon.displayName,
      },
    });
  }

  private async removeFromTurnOrder(
    participant: EncounterParticipantEntity,
    encounters: Repository<EncounterEntity>,
  ): Promise<void> {
    const encounter = await encounters.findOne({
      where: { id: participant.encounterId },
    });
    if (!encounter || !Array.isArray(encounter.turnOrder)) return;

    const removeIndex = encounter.turnOrder.indexOf(participant.id);
    if (removeIndex < 0) return;

    encounter.turnOrder = encounter.turnOrder.filter(
      (id) => id !== participant.id,
    );
    if (removeIndex < encounter.currentTurnIndex) {
      encounter.currentTurnIndex = Math.max(0, encounter.currentTurnIndex - 1);
    } else if (removeIndex === encounter.currentTurnIndex) {
      encounter.currentTurnIndex = Math.min(
        encounter.currentTurnIndex,
        Math.max(0, encounter.turnOrder.length - 1),
      );
    }
    await encounters.save(encounter);
  }

  async breakDueToDeath(
    caster: EncounterParticipantEntity,
  ): Promise<{ events: GameEventData[] }> {
    return this.break(caster, "death");
  }


  async checkBreakOnCondition(
    target: EncounterParticipantEntity,
    addedSlug: ConditionSlug,
  ): Promise<{ events: GameEventData[]; broken: boolean }> {
    if (!target.isConcentrating) return { events: [], broken: false };
    if (!INCAPACITATING.includes(addedSlug)) {
      return { events: [], broken: false };
    }
    const r = await this.break(target, "incapacitated");
    return { events: r.events, broken: true };
  }


  async decrementDurationFor(
    caster: EncounterParticipantEntity,
  ): Promise<{ events: GameEventData[] }> {
    if (!caster.isConcentrating) return { events: [] };
    if (caster.concentrationRoundsRemaining == null) return { events: [] };
    caster.concentrationRoundsRemaining -= 1;
    if (caster.concentrationRoundsRemaining <= 0) {
      return this.break(caster, "expired");
    }
    await this.participants.save(caster);
    return { events: [] };
  }

  private deriveSlugs(instances: ConditionInstance[]): string[] {
    return Array.from(new Set(instances.map((i) => i.slug)));
  }
}
