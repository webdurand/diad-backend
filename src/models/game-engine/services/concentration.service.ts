import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
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

export type ConcentrationBreakReason =
  | "damage"
  | "incapacitated"
  | "replaced"
  | "expired"
  | "death"
  | "manual";

const INCAPACITATING: ConditionSlug[] = [
  "incapacitated",
  "paralyzed",
  "petrified",
  "stunned",
  "unconscious",
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
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    if (!caster.isConcentrating) {
      return { events };
    }
    const prev = caster.concentratingOn;
    const effects = caster.appliedEffects ?? [];


    const targetIds = effects
      .filter((e) => e.kind === "condition" && e.targetParticipantId)
      .map((e) => e.targetParticipantId as string);
    const uniqueIds = Array.from(new Set(targetIds));
    const targets = uniqueIds.length
      ? await this.participants.findByIds(uniqueIds)
      : [];

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



        const area = await this.areas.findOne({ where: { id: eff.refId } });
        await this.areas.delete({ id: eff.refId });
        events.push({
          event_type: area?.effectKind
            ? "tile_effect_concentration_broken"
            : "persistent_area_removed",
          data: {
            areaId: eff.refId,
            sourceSpell: area?.sourceSpell,
            effectKind: area?.effectKind,
            casterId: caster.id,
            reason: "concentration_broken",
            narrativeDescriptor: area?.narrativeDescriptor,
            tactical: area?.tacticalMetadata,
          },
        });
      } else if (eff.kind === "summon") {
        await this.resolveSummonConcentrationBreak(caster, eff, reason, events);
      }
    }
    if (targets.length) await this.participants.save(targets);





    const orphanAreas = await this.areas.find({
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
            reason: "concentration_broken",
            narrativeDescriptor: a.narrativeDescriptor,
            tactical: a.tacticalMetadata,
          },
        });
      }
      await this.areas.delete(orphanAreas.map((a) => a.id));
    }





    const encounterParticipants = await this.participants.find({
      where: { encounterId: caster.encounterId },
    });
    for (const p of encounterParticipants) {
      const before = p.effectInstances ?? [];
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
        if (p.id === caster.id) {

          caster.effectInstances = kept;
        } else {
          await this.participants.save(p);
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
        await this.participants.save(p);
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
    caster.concentratingOn = undefined as unknown as string;
    caster.concentrationRoundsRemaining = null;
    caster.concentrationSaveDc = null;
    caster.appliedEffects = [];
    await this.participants.save(caster);

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
  ): Promise<void> {
    const summon = await this.participants.findOne({
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
      await this.participants.save(summon);
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

    await this.removeFromTurnOrder(summon);
    await this.participants.remove(summon);
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
  ): Promise<void> {
    const encounter = await this.encounters.findOne({
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
    await this.encounters.save(encounter);
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
