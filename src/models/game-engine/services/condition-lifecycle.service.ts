import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterClassEntity } from "src/entities/character-class.entity";
import type {
  ConditionInstance,
  ConditionSlug,
  ConditionSource,
  RepeatSaveTiming,
  SaveAbility,
} from "../interfaces/combat.interfaces";
import type { GameEventData } from "../interfaces/result.type";
import { ConcentrationService } from "./concentration.service";
import { DiceService } from "./dice.service";
import {
  narrativeForConditionRemoval,
  type RemovalReason,
} from "./narrative-condition-removal";

export interface ApplyConditionInput {
  slug: ConditionSlug;
  appliedBy?: string | null;
  sourceSpell?: string | null;
  sourceConcentration?: boolean;

  source?: ConditionSource;
  saveAbility?: SaveAbility | null;
  saveDc?: number | null;
  repeatSaveTiming?: RepeatSaveTiming;
  durationRoundsRemaining?: number | null;
  level?: number;
}


function resolveSource(input: ApplyConditionInput): ConditionSource {
  if (input.source) return input.source;
  if (input.sourceSpell) {
    return `spell:${input.sourceSpell}` as ConditionSource;
  }
  return "manual";
}


@Injectable()
export class ConditionLifecycleService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly characterClasses: Repository<CharacterClassEntity>,
    private readonly concentration: ConcentrationService,
    private readonly dice: DiceService,
  ) {}


  private async isBlockedByNaturesWard(
    target: EncounterParticipantEntity,
    slug: string,
  ): Promise<boolean> {
    if (target.type !== "pc" || !target.characterId) return false;
    if (!["charmed", "frightened", "poisoned"].includes(slug)) return false;
    const classes = await this.characterClasses.find({
      where: { character_id: target.characterId },
      relations: ["class", "subclass"],
    });
    const druid = classes.find(
      (c) => c.class?.slug === "druid" || c.class?.slug === "druid-phb",
    );
    if (!druid || druid.class_level < 10) return false;
    const sub = (
      druid.subclass as { slug?: string } | undefined
    )?.slug?.replace(/-(phb|xphb)$/, "");
    return sub === "land";
  }


  async applyCondition(
    target: EncounterParticipantEntity,
    input: ApplyConditionInput,
  ): Promise<{
    events: GameEventData[];
    instance: ConditionInstance;
    concentrationBroken: boolean;
  }> {

    const blockedByWard = await this.isBlockedByNaturesWard(target, input.slug);
    if (blockedByWard) {
      const stubInstance: ConditionInstance = {
        id: randomUUID(),
        slug: input.slug,
        appliedBy: input.appliedBy ?? null,
        sourceSpell: input.sourceSpell ?? null,
        sourceConcentration: false,
        source: resolveSource(input),
        saveAbility: null,
        saveDc: null,
        repeatSaveTiming: "never",
        durationRoundsRemaining: 0,
        level: input.level,
        appliedAt: new Date().toISOString(),
      };
      return {
        events: [
          {
            event_type: "condition_blocked_by_immunity",
            target_participant_id: target.id,
            data: {
              slug: input.slug,
              source: "natures-ward",
              feature: "Land Druid L10",
            },
          },
        ],
        instance: stubInstance,
        concentrationBroken: false,
      };
    }

    const instance: ConditionInstance = {
      id: randomUUID(),
      slug: input.slug,
      appliedBy: input.appliedBy ?? null,
      sourceSpell: input.sourceSpell ?? null,
      sourceConcentration: input.sourceConcentration ?? false,
      source: resolveSource(input),
      saveAbility: input.saveAbility ?? null,
      saveDc: input.saveDc ?? null,
      repeatSaveTiming: input.repeatSaveTiming ?? "never",
      durationRoundsRemaining: input.durationRoundsRemaining ?? null,
      level: input.level,
      appliedAt: new Date().toISOString(),
    };

    target.conditionInstances = [
      ...(target.conditionInstances ?? []),
      instance,
    ];
    target.conditions = this.deriveSlugs(target.conditionInstances);


    if (input.slug === "grappled" && input.appliedBy) {
      target.grappledByParticipantId = input.appliedBy;
    }

    await this.participants.save(target);

    const events: GameEventData[] = [
      {
        event_type: "condition_applied",
        target_participant_id: target.id,
        actor_participant_id: input.appliedBy ?? undefined,
        data: {
          instanceId: instance.id,
          slug: instance.slug,
          sourceSpell: instance.sourceSpell,
          sourceConcentration: instance.sourceConcentration,
          saveAbility: instance.saveAbility,
          saveDc: instance.saveDc,
          durationRoundsRemaining: instance.durationRoundsRemaining,
          level: instance.level,
        },
      },
    ];


    const conc = await this.concentration.checkBreakOnCondition(
      target,
      input.slug,
    );
    events.push(...conc.events);

    return { events, instance, concentrationBroken: conc.broken };
  }


  async removeConditionInstance(
    target: EncounterParticipantEntity,
    instanceId: string,
    reason: RemovalReason | string = "manual",
  ): Promise<{ events: GameEventData[]; removed: boolean }> {
    const before = (target.conditionInstances ?? []).length;
    const removed = (target.conditionInstances ?? []).find(
      (ci) => ci.id === instanceId,
    );
    target.conditionInstances = (target.conditionInstances ?? []).filter(
      (ci) => ci.id !== instanceId,
    );
    if (target.conditionInstances.length === before) {
      return { events: [], removed: false };
    }
    target.conditions = this.deriveSlugs(target.conditionInstances);


    if (!target.conditionInstances.some((ci) => ci.slug === "grappled")) {
      target.grappledByParticipantId = null;
    }

    await this.participants.save(target);
    const narrativeDescriptor = removed
      ? narrativeForConditionRemoval(removed.slug, reason)
      : "";
    return {
      events: [
        {
          event_type: "condition_removed",
          target_participant_id: target.id,
          data: {
            instanceId,
            slug: removed?.slug ?? null,
            source: removed?.source ?? "manual",
            removalReason: reason,
            narrativeDescriptor,

            reason,
          },
        },
      ],
      removed: true,
    };
  }


  async revalidateAfterHpChange(
    target: EncounterParticipantEntity,
    prevHp: number,
    newHp: number,
  ): Promise<{ events: GameEventData[]; removed: ConditionInstance[] }> {
    if (!(prevHp <= 0 && newHp > 0)) {
      return { events: [], removed: [] };
    }
    const before = target.conditionInstances ?? [];
    const toRemove = before.filter((ci) => ci.source === "hp_zero");
    if (toRemove.length === 0) {
      return { events: [], removed: [] };
    }
    target.conditionInstances = before.filter((ci) => ci.source !== "hp_zero");
    target.conditions = this.deriveSlugs(target.conditionInstances);
    if (!target.conditionInstances.some((ci) => ci.slug === "grappled")) {
      target.grappledByParticipantId = null;
    }
    await this.participants.save(target);

    const events: GameEventData[] = toRemove.map((ci) => ({
      event_type: "condition_removed",
      target_participant_id: target.id,
      data: {
        instanceId: ci.id,
        slug: ci.slug,
        source: ci.source,
        removalReason: "hp_restored" as RemovalReason,
        narrativeDescriptor: narrativeForConditionRemoval(
          ci.slug,
          "hp_restored",
        ),
        reason: "hp_restored",
      },
    }));
    return { events, removed: toRemove };
  }


  async removeConditionsBySource(
    targets: EncounterParticipantEntity[],
    source: ConditionSource,
    reason: RemovalReason = "source_ended",
  ): Promise<{ events: GameEventData[]; removedCount: number }> {
    const events: GameEventData[] = [];
    let removedCount = 0;
    for (const target of targets) {
      const before = target.conditionInstances ?? [];
      const toRemove = before.filter((ci) => ci.source === source);
      if (toRemove.length === 0) continue;
      target.conditionInstances = before.filter((ci) => ci.source !== source);
      target.conditions = this.deriveSlugs(target.conditionInstances);
      if (!target.conditionInstances.some((ci) => ci.slug === "grappled")) {
        target.grappledByParticipantId = null;
      }
      await this.participants.save(target);
      for (const ci of toRemove) {
        events.push({
          event_type: "condition_removed",
          target_participant_id: target.id,
          data: {
            instanceId: ci.id,
            slug: ci.slug,
            source: ci.source,
            removalReason: reason,
            narrativeDescriptor: narrativeForConditionRemoval(ci.slug, reason),
            reason,
          },
        });
        removedCount += 1;
      }
    }
    return { events, removedCount };
  }


  async processEndOfTurn(
    target: EncounterParticipantEntity,
    getSaveModifier: (ability: SaveAbility) => Promise<{
      modifier: number;
      advantage: boolean;
      disadvantage: boolean;
    }>,
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    const remaining: ConditionInstance[] = [];
    for (const ci of target.conditionInstances ?? []) {
      if (
        ci.repeatSaveTiming === "end_of_turn" &&
        ci.saveAbility &&
        ci.saveDc != null
      ) {
        const mod = await getSaveModifier(ci.saveAbility);
        let rolled: number;
        if (mod.advantage && !mod.disadvantage) {
          rolled = this.dice.rollWithAdvantage().chosen;
        } else if (mod.disadvantage && !mod.advantage) {
          rolled = this.dice.rollWithDisadvantage().chosen;
        } else {
          rolled = this.dice.roll(20);
        }
        const total = rolled + mod.modifier;
        const passed = total >= ci.saveDc;
        events.push({
          event_type: "end_of_turn_save_rolled",
          target_participant_id: target.id,
          data: {
            instanceId: ci.id,
            slug: ci.slug,
            ability: ci.saveAbility,
            dc: ci.saveDc,
            rolled,
            modifier: mod.modifier,
            total,
            passed,
          },
        });
        if (passed) {

          continue;
        }

        if (ci.durationRoundsRemaining != null) {
          ci.durationRoundsRemaining -= 1;
          if (ci.durationRoundsRemaining <= 0) {
            events.push({
              event_type: "condition_expired",
              target_participant_id: target.id,
              data: { instanceId: ci.id, slug: ci.slug },
            });
            continue;
          }
        }
      }
      remaining.push(ci);
    }
    if (remaining.length !== (target.conditionInstances ?? []).length) {
      target.conditionInstances = remaining;
      target.conditions = this.deriveSlugs(remaining);
      if (!remaining.some((ci) => ci.slug === "grappled")) {
        target.grappledByParticipantId = null;
      }
      await this.participants.save(target);
    }
    return { events };
  }


  async decrementDurationsAtRoundStart(
    participants: EncounterParticipantEntity[],
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    for (const p of participants) {
      const remaining: ConditionInstance[] = [];
      let changed = false;
      for (const ci of p.conditionInstances ?? []) {
        if (
          ci.repeatSaveTiming !== "end_of_turn" &&
          ci.durationRoundsRemaining != null
        ) {
          ci.durationRoundsRemaining -= 1;
          if (ci.durationRoundsRemaining <= 0) {
            changed = true;
            events.push({
              event_type: "condition_expired",
              target_participant_id: p.id,
              data: { instanceId: ci.id, slug: ci.slug },
            });
            continue;
          }
          changed = true;
        }
        remaining.push(ci);
      }
      if (changed) {
        p.conditionInstances = remaining;
        p.conditions = this.deriveSlugs(remaining);
        if (!remaining.some((ci) => ci.slug === "grappled")) {
          p.grappledByParticipantId = null;
        }
        await this.participants.save(p);
      }
    }
    return { events };
  }

  private deriveSlugs(instances: ConditionInstance[]): string[] {
    return Array.from(new Set(instances.map((i) => i.slug)));
  }
}
