import { Injectable, Optional } from "@nestjs/common";
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
import type { ConcentrationBreakReason } from "./concentration.service";
import { DiceService } from "./dice.service";
import {
  narrativeForConditionRemoval,
  type RemovalReason,
} from "./narrative-condition-removal";
import { canSeeFearSource } from "./fear-compulsion";
import { getSummonStatBlock } from "./summon-stat-block";
import { PaladinAuraService } from "./paladin-aura.service";
import {
  hasProtectionFromEvilGood,
  participantCreatureType,
  protectionBlocksCondition,
} from "./protection-from-evil-good";
import {
  hasFreedomOfMovement,
  isMagicalMobilityCondition,
} from "./freedom-of-movement";

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
  expiresAtTurnEndParticipantId?: string | null;
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
    @Optional()
    private readonly paladinAuras?: PaladinAuraService,
  ) {}

  private async getConditionImmunitySource(
    target: EncounterParticipantEntity,
    slug: ConditionSlug,
  ): Promise<string | null> {
    const immunitySlug = slug === "hypnotized" ? "charmed" : slug;
    const summonStatBlock = getSummonStatBlock(target);
    if (
      summonStatBlock?.conditionImmunities.some(
        (condition) => condition.toLowerCase() === immunitySlug,
      )
    ) {
      return summonStatBlock.kind;
    }

    const resolvedTarget =
      target.monsterId && !target.monster
        ? ((await this.participants.findOne({
            where: { id: target.id },
            relations: ["monster"],
          })) ?? target)
        : target;
    const rawImmunities = resolvedTarget.monster?.condition_immunities;
    const entries = Array.isArray(rawImmunities)
      ? rawImmunities
      : rawImmunities && typeof rawImmunities === "object"
        ? Object.values(rawImmunities)
        : [];
    const isImmune = entries.some((entry) =>
      String(entry)
        .toLowerCase()
        .split(/[,\s()]+/)
        .includes(immunitySlug),
    );
    return isImmune ? "monster-stat-block" : null;
  }


  private async isBlockedByNaturesWard(
    target: EncounterParticipantEntity,
    slug: string,
  ): Promise<boolean> {
    if (target.type !== "pc" || !target.characterId) return false;
    const immunitySlug = slug === "hypnotized" ? "charmed" : slug;
    if (!["charmed", "frightened", "poisoned"].includes(immunitySlug)) {
      return false;
    }
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

  private async isBlockedByProtectionFromEvilGood(
    target: EncounterParticipantEntity,
    input: ApplyConditionInput,
  ): Promise<boolean> {
    if (
      !input.appliedBy ||
      !hasProtectionFromEvilGood(target.effectInstances) ||
      !["charmed", "frightened", "hypnotized"].includes(input.slug)
    ) {
      return false;
    }
    const source = await this.participants.findOne({
      where: { id: input.appliedBy },
      relations: ["monster"],
    });
    return protectionBlocksCondition(
      target.effectInstances,
      input.slug,
      participantCreatureType(source),
    );
  }


  async applyCondition(
    target: EncounterParticipantEntity,
    input: ApplyConditionInput,
  ): Promise<{
    events: GameEventData[];
    instance: ConditionInstance;
    concentrationBroken: boolean;
  }> {

    const immunitySource = await this.getConditionImmunitySource(
      target,
      input.slug,
    );
    const blockedByWard =
      !immunitySource &&
      (await this.isBlockedByNaturesWard(target, input.slug));
    const blockedByProtection =
      !immunitySource &&
      !blockedByWard &&
      (await this.isBlockedByProtectionFromEvilGood(target, input));
    const blockedByFreedom =
      !immunitySource &&
      !blockedByWard &&
      !blockedByProtection &&
      hasFreedomOfMovement(target) &&
      isMagicalMobilityCondition({
        slug: input.slug,
        source: resolveSource(input),
        sourceSpell: input.sourceSpell ?? null,
      });
    const auraImmunity =
      !immunitySource &&
      !blockedByWard &&
      !blockedByProtection &&
      !blockedByFreedom
        ? await this.paladinAuras?.getConditionImmunity(target, input.slug)
        : null;
    if (
      immunitySource ||
      blockedByWard ||
      auraImmunity ||
      blockedByProtection ||
      blockedByFreedom
    ) {
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
        expiresAtTurnEndParticipantId:
          input.expiresAtTurnEndParticipantId ?? null,
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
              source:
                immunitySource ??
                (blockedByWard
                  ? "natures-ward"
                  : blockedByFreedom
                    ? "freedom-of-movement"
                  : auraImmunity?.featureSlug ??
                    "protection-from-evil-and-good"),
              feature: immunitySource
                ? target.displayName
                : blockedByWard
                  ? "Land Druid L10"
                  : blockedByFreedom
                    ? "Freedom of Movement"
                  : blockedByProtection
                    ? "Protection from Evil and Good"
                    : auraImmunity?.featureSlug === "aura-of-courage"
                      ? "Aura da Coragem"
                      : "Aura de Devoção",
              sourceParticipantId: auraImmunity?.sourceParticipantId,
              sourceParticipantName: auraImmunity?.sourceName,
              radiusFeet: auraImmunity?.radiusFeet,
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
      expiresAtTurnEndParticipantId:
        input.expiresAtTurnEndParticipantId ?? null,
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
          expiresAtTurnEndParticipantId:
            instance.expiresAtTurnEndParticipantId,
          level: instance.level,
        },
      },
    ];

    if (instance.sourceConcentration && instance.appliedBy) {
      const caster =
        target.id === instance.appliedBy
          ? target
          : await this.participants.findOne({
              where: { id: instance.appliedBy },
            });
      if (caster) {
        await this.concentration.trackAppliedEffect(caster, {
          kind: "condition",
          refId: instance.id,
          targetParticipantId: target.id,
          description: `${instance.sourceSpell ?? "concentration"}: ${instance.slug}`,
        });
      }
    }

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

  async removeConditionsEndedByDamage(
    target: EncounterParticipantEntity,
  ): Promise<GameEventData[]> {
    const endedByDamage = (target.conditionInstances ?? []).filter(
      (condition) =>
        condition.slug === "hypnotized" ||
        (condition.slug === "frightened" &&
          condition.source === "feature:abjure-foes"),
    );
    const events: GameEventData[] = [];
    for (const condition of endedByDamage) {
      const removed = await this.removeConditionInstance(
        target,
        condition.id,
        "damage_received",
      );
      events.push(...removed.events);
    }
    if (
      endedByDamage.some(
        (condition) => condition.source === "feature:abjure-foes",
      )
    ) {
      target.effectInstances = (target.effectInstances ?? []).filter(
        (effect) => effect.kind !== "abjure_foes_turn_choice",
      );
      await this.participants.save(target);
    }
    return events;
  }

  async breakConcentration(
    target: EncounterParticipantEntity,
    reason: ConcentrationBreakReason,
  ): Promise<GameEventData[]> {
    if (!target.isConcentrating) return [];
    const result = await this.concentration.break(target, reason);
    return result.events;
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
    let changed = false;
    for (const ci of target.conditionInstances ?? []) {
      if (ci.slug === "haste_lethargy") {
        ci.durationRoundsRemaining =
          (ci.durationRoundsRemaining ?? 1) - 1;
        changed = true;
        if (ci.durationRoundsRemaining <= 0) {
          events.push({
            event_type: "condition_removed",
            target_participant_id: target.id,
            data: {
              instanceId: ci.id,
              slug: ci.slug,
              source: ci.source,
              removalReason: "haste_next_turn_ended",
              reason: "haste_next_turn_ended",
            },
          });
          continue;
        }
        remaining.push(ci);
        continue;
      }
      if (
        ci.repeatSaveTiming === "end_of_turn" &&
        ci.saveAbility &&
        ci.saveDc != null
      ) {
        const normalizedSourceSpell = ci.sourceSpell?.replace(
          /-(phb|xphb|srd52)$/,
          "",
        );
        if (normalizedSourceSpell === "fear" && ci.appliedBy) {
          const source = await this.participants.findOne({
            where: { id: ci.appliedBy },
          });
          if (canSeeFearSource(source)) {
            events.push({
              event_type: "fear_save_not_available",
              target_participant_id: target.id,
              actor_participant_id: ci.appliedBy,
              data: {
                instanceId: ci.id,
                slug: ci.slug,
                reason: "source_still_visible",
              },
            });
            remaining.push(ci);
            continue;
          }
        }
        const mod = await getSaveModifier(ci.saveAbility);
        let rolled: number;
        let advantage:
          | {
              roll1: number;
              roll2: number;
              chosen: number;
              discarded: number;
            }
          | undefined;
        if (mod.advantage && !mod.disadvantage) {
          advantage = this.dice.rollWithAdvantage();
          rolled = advantage.chosen;
        } else if (mod.disadvantage && !mod.advantage) {
          advantage = this.dice.rollWithDisadvantage();
          rolled = advantage.chosen;
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
            advantage,
            hasAdvantage: mod.advantage && !mod.disadvantage,
            hasDisadvantage: mod.disadvantage && !mod.advantage,
            advantageCancelled: mod.advantage && mod.disadvantage,
          },
        });
        if (passed) {
          changed = true;
          events.push({
            event_type: "condition_removed",
            target_participant_id: target.id,
            data: {
              instanceId: ci.id,
              slug: ci.slug,
              source: ci.source,
              removalReason: "target_saved",
              narrativeDescriptor: narrativeForConditionRemoval(
                ci.slug,
                "target_saved",
              ),
              reason: "target_saved",
            },
          });
          continue;
        }

        if (ci.durationRoundsRemaining != null) {
          ci.durationRoundsRemaining -= 1;
          changed = true;
          if (ci.durationRoundsRemaining <= 0) {
            events.push({
              event_type: "condition_expired",
              target_participant_id: target.id,
              data: { instanceId: ci.id, slug: ci.slug },
            });
            continue;
          }
        }

        const normalizedSourceSpellAfterSave = ci.sourceSpell?.replace(
          /-(phb|xphb|srd52)$/,
          "",
        );
        if (
          normalizedSourceSpellAfterSave === "sleep" &&
          ci.slug === "incapacitated"
        ) {
          const previousSlug = ci.slug;
          ci.slug = "unconscious";
          ci.repeatSaveTiming = "never";
          changed = true;
          events.push(
            {
              event_type: "condition_removed",
              target_participant_id: target.id,
              data: {
                instanceId: ci.id,
                slug: previousSlug,
                source: ci.source,
                removalReason: "sleep_second_save_failed",
              },
            },
            {
              event_type: "condition_applied",
              target_participant_id: target.id,
              actor_participant_id: ci.appliedBy ?? undefined,
              data: {
                instanceId: ci.id,
                slug: ci.slug,
                sourceSpell: ci.sourceSpell,
                sourceConcentration: ci.sourceConcentration,
                durationRoundsRemaining: ci.durationRoundsRemaining,
                stage: "sleep_second_save_failed",
              },
            },
          );
        }
      }
      remaining.push(ci);
    }
    if (
      changed ||
      remaining.length !== (target.conditionInstances ?? []).length
    ) {
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

  async expireAtParticipantTurnEnd(
    encounterId: string,
    participantId: string,
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    const participants = await this.participants.find({
      where: { encounterId },
    });

    for (const target of participants) {
      const expiring = (target.conditionInstances ?? []).filter(
        (instance) =>
          instance.expiresAtTurnEndParticipantId === participantId,
      );
      if (expiring.length === 0) continue;

      const expiringIds = new Set(expiring.map((instance) => instance.id));
      target.conditionInstances = (target.conditionInstances ?? []).filter(
        (instance) => !expiringIds.has(instance.id),
      );
      target.conditions = this.deriveSlugs(target.conditionInstances);
      if (
        !target.conditionInstances.some(
          (instance) => instance.slug === "grappled",
        )
      ) {
        target.grappledByParticipantId = null;
      }
      await this.participants.save(target);

      for (const instance of expiring) {
        events.push({
          event_type: "condition_expired",
          actor_participant_id: participantId,
          target_participant_id: target.id,
          data: {
            instanceId: instance.id,
            slug: instance.slug,
            source: instance.source,
            removalReason: "source_turn_ended",
          },
        });
      }
    }

    return { events };
  }

  private deriveSlugs(instances: ConditionInstance[]): string[] {
    return Array.from(new Set(instances.map((i) => i.slug)));
  }
}
