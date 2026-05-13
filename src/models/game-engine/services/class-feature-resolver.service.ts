import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterStateEntity } from "src/entities/character-state.entity";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { EffectInstanceService } from "./effect-instance.service";
import { DiceService } from "./dice.service";
import { TransformationService } from "./transformation.service";
import { BardFeaturesService } from "./bard-features.service";
import type { GameEventData } from "../interfaces/result.type";


export interface ClassFeatureInvokedPayload {
  featureSlug: string;
  actionCost?: string;
  targets?: string[];
  options?: Record<string, unknown>;
  saveDc?: number;
  saveAbility?: "str" | "dex" | "con" | "int" | "wis" | "cha";
  caster?: {
    abilityMods?: Record<string, number>;
    profBonus?: number;
    classSlug?: string;
    classLevel?: number;
  };
  triggerEventId?: string;
  status?: string;
}


@Injectable()
export class ClassFeatureResolverService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly charStates: Repository<CharacterStateEntity>,
    private readonly conditionLifecycle: ConditionLifecycleService,
    private readonly effectInstances: EffectInstanceService,
    private readonly dice: DiceService,
    private readonly transformation: TransformationService,
    private readonly bard: BardFeaturesService,
  ) {}

  async resolveInvocation(
    sourceParticipantId: string,
    payload: ClassFeatureInvokedPayload,
  ): Promise<{
    resolved: boolean;
    events: GameEventData[];
    resolutionPayload?: Record<string, unknown>;
  }> {
    const events: GameEventData[] = [];
    const slug = payload.featureSlug;

    switch (slug) {
      case "turn-undead":
        return this.handleTurnUndead(sourceParticipantId, payload, events);
      case "rage":
        return this.handleRage(sourceParticipantId, payload, events);
      case "grapple":
        return this.handleGrapple(sourceParticipantId, payload, events);
      case "shove":
        return this.handleShove(sourceParticipantId, payload, events);
      case "wild-shape":
        return this.handleWildShape(sourceParticipantId, payload, events);
      case "channel-divinity":
        return this.handleChannelDivinity(sourceParticipantId, payload, events);
      case "arcane-recovery":
        return this.handleArcaneRecovery(sourceParticipantId, payload, events);
      case "divine-sense":
        return this.handleDivineSense(sourceParticipantId, payload, events);
      case "bardic-inspiration":
        return this.handleBardicInspiration(
          sourceParticipantId,
          payload,
          events,
        );
      case "cutting-words":
        return this.handleCuttingWords(sourceParticipantId, payload, events);
      case "countercharm":
        return this.handleCountercharm(sourceParticipantId, payload, events);
      case "dark-ones-blessing":
        return this.handleDarkOnesBlessing(
          sourceParticipantId,
          payload,
          events,
        );
      case "dark-ones-own-luck":
        return this.handleDarkOnesOwnLuck(sourceParticipantId, payload, events);
      case "flurry-of-blows":
        return this.handleFlurryOfBlows(sourceParticipantId, payload, events);
      case "patient-defense":
        return this.handlePatientDefense(sourceParticipantId, payload, events);
      case "step-of-the-wind":
        return this.handleStepOfTheWind(sourceParticipantId, payload, events);
      case "stunning-strike":
        return this.handleStunningStrike(sourceParticipantId, payload, events);
      case "steady-aim":
        return this.handleSteadyAim(sourceParticipantId, payload, events);
      case "uncanny-dodge":
        return this.handleUncannyDodge(sourceParticipantId, payload, events);
      case "tireless":
        return this.handleTireless(sourceParticipantId, payload, events);
      case "natures-veil":
        return this.handleNaturesVeil(sourceParticipantId, payload, events);
      case "natural-recovery":
        return this.handleNaturalRecovery(sourceParticipantId, payload, events);
      case "favored-enemy":
        return this.handleFavoredEnemy(sourceParticipantId, payload, events);
      default:
        return { resolved: false, events };
    }
  }






  private async handleFavoredEnemy(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    const rangerLevel = payload.caster?.classLevel ?? 1;
    const freeCasts =
      rangerLevel >= 17
        ? 6
        : rangerLevel >= 13
          ? 5
          : rangerLevel >= 9
            ? 4
            : rangerLevel >= 5
              ? 3
              : 2;
    events.push({
      event_type: "favored_enemy_ready",
      actor_participant_id: sourceId,
      data: { freeCasts, rangerLevel, spellSlug: "hunter-mark" },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: { freeCasts, rangerLevel },
    };
  }




  private async handleNaturalRecovery(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const classLevel = payload.caster?.classLevel ?? 2;
    const budget = Math.floor(classLevel / 2);
    const assignments = (opts.slotAssignments as Record<string, number>) ?? {
      level1: 1,
    };

    let spent = 0;
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source?.characterId) return { resolved: false, events };
    const st = await this.charStates.findOne({
      where: { character_id: source.characterId },
    });
    if (!st) return { resolved: false, events };

    const slots =
      (st as unknown as { spell_slots?: Record<string, number> }).spell_slots ??
      {};
    const regained: Record<string, number> = {};
    for (const [lvlKey, count] of Object.entries(assignments)) {
      const lvl = parseInt(lvlKey.replace("level", ""), 10);
      if (lvl > 5 || count <= 0) continue;
      const addBudget = lvl * count;
      if (spent + addBudget > budget) continue;
      const currentUsed = slots[lvlKey] ?? 0;
      const toRegain = Math.min(currentUsed, count);
      if (toRegain <= 0) continue;
      slots[lvlKey] = currentUsed - toRegain;
      regained[lvlKey] = toRegain;
      spent += lvl * toRegain;
    }
    (st as unknown as { spell_slots?: Record<string, number> }).spell_slots =
      slots;
    await this.charStates.save(st);

    events.push({
      event_type: "natural_recovery_used",
      actor_participant_id: sourceId,
      data: { budgetSpent: spent, budgetTotal: budget, regained },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: { budgetSpent: spent, regained },
    };
  }




  private async handleTireless(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    const wisMod = payload.caster?.abilityMods?.wis ?? 0;
    const rolled = this.dice.roll(8);
    const total = rolled + wisMod;
    if (source.characterId) {
      const st = await this.charStates.findOne({
        where: { character_id: source.characterId },
      });
      if (st) {
        st.current_hp = st.current_hp + total;
        await this.charStates.save(st);
      }
    } else {
      source.currentHp = Math.min(
        source.maxHp ?? 0,
        (source.currentHp ?? 0) + total,
      );
      await this.participants.save(source);
    }
    events.push({
      event_type: "tireless_heal",
      actor_participant_id: sourceId,
      data: { rolled, wisMod, total },
    });
    return { resolved: true, events, resolutionPayload: { healAmount: total } };
  }




  private async handleNaturesVeil(
    sourceId: string,
    _payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    const r = await this.conditionLifecycle.applyCondition(source, {
      slug: "invisible",
      appliedBy: sourceId,
      sourceFeature: "natures-veil",
      sourceConcentration: false,
      durationRoundsRemaining: 1,
    } as unknown as Parameters<
      typeof this.conditionLifecycle.applyCondition
    >[1]);
    events.push(...r.events, {
      event_type: "natures_veil_activated",
      actor_participant_id: sourceId,
      data: { durationRounds: 1 },
    });
    return { resolved: true, events };
  }




  private async handleSteadyAim(
    sourceId: string,
    _payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    source.movementRemaining = 0;
    const res = await this.effectInstances.addEffect(source, {
      kind: "self_advantage_next_attack" as never,
      sourceCasterParticipantId: sourceId,
      sourceFeatureSlug: "steady-aim",
      payload: { reason: "steady-aim" },
      requiresConcentration: false,
    } as unknown as Parameters<typeof this.effectInstances.addEffect>[1]);
    await this.participants.save(source);
    events.push(...res.events, {
      event_type: "steady_aim_armed",
      actor_participant_id: sourceId,
      data: { advantageNextAttack: true, movementSpent: true },
    });
    return { resolved: true, events };
  }




  private async handleUncannyDodge(
    sourceId: string,
    _payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    source.reactionsUsed = (source.reactionsUsed ?? 0) + 1;
    const res = await this.effectInstances.addEffect(source, {
      kind: "uncanny_dodge_armed" as never,
      sourceCasterParticipantId: sourceId,
      sourceFeatureSlug: "uncanny-dodge",
      payload: { halvesNextDamage: true },
      requiresConcentration: false,
    } as unknown as Parameters<typeof this.effectInstances.addEffect>[1]);
    await this.participants.save(source);
    events.push(...res.events, {
      event_type: "uncanny_dodge_armed",
      actor_participant_id: sourceId,
      data: { halvesNextDamage: true },
    });
    return { resolved: true, events };
  }




  private async handleFlurryOfBlows(
    sourceId: string,
    _payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    source.attacksMaxThisTurn = (source.attacksMaxThisTurn ?? 1) + 2;
    await this.participants.save(source);
    events.push({
      event_type: "flurry_of_blows_armed",
      actor_participant_id: sourceId,
      data: { extraAttacks: 2, focusPointsCost: 1 },
    });
    return { resolved: true, events, resolutionPayload: { extraAttacks: 2 } };
  }




  private async handlePatientDefense(
    sourceId: string,
    _payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    source.dodgingUntilTurnOfParticipantId = sourceId;
    source.hasDisengaged = true;
    await this.participants.save(source);
    events.push({
      event_type: "patient_defense_activated",
      actor_participant_id: sourceId,
      data: { focusPointsCost: 1, dodgeUntil: sourceId, disengaged: true },
    });
    return { resolved: true, events };
  }




  private async handleStepOfTheWind(
    sourceId: string,
    _payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    source.hasDashed = true;
    source.hasDisengaged = true;
    if (source.movementRemaining != null) {
      source.movementRemaining *= 2;
    }
    await this.participants.save(source);
    events.push({
      event_type: "step_of_the_wind_activated",
      actor_participant_id: sourceId,
      data: { focusPointsCost: 1, dashed: true, disengaged: true },
    });
    return { resolved: true, events };
  }





  private async handleStunningStrike(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const targetId =
      (opts.targetParticipantId as string) ?? (payload.targets?.[0] as string);
    if (!targetId) return { resolved: false, events };
    const target = await this.participants.findOne({ where: { id: targetId } });
    if (!target) return { resolved: false, events };
    const saveDc =
      payload.saveDc ??
      8 +
        (payload.caster?.profBonus ?? 2) +
        (payload.caster?.abilityMods?.wis ?? 0);
    const conMod = this.getAbilityMod(target, "con");
    const rolled = this.dice.roll(20);
    const total = rolled + conMod;
    const saved = total >= saveDc;
    events.push({
      event_type: "save_rolled",
      target_participant_id: targetId,
      data: {
        ability: "con",
        dc: saveDc,
        rolled,
        modifier: conMod,
        total,
        success: saved,
        source: "stunning-strike",
      },
    });
    if (!saved) {
      const r = await this.conditionLifecycle.applyCondition(target, {
        slug: "stunned",
        appliedBy: sourceId,
        sourceFeature: "stunning-strike",
        sourceConcentration: false,
        saveAbility: "con",
        saveDc,
        repeatSaveTiming: "end_of_turn",
        durationRoundsRemaining: 1,
      } as unknown as Parameters<
        typeof this.conditionLifecycle.applyCondition
      >[1]);
      events.push(...r.events);
    }
    return {
      resolved: true,
      events,
      resolutionPayload: { saved, rolled, total, saveDc },
    };
  }




  private async handleDarkOnesBlessing(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    const chaMod = payload.caster?.abilityMods?.cha ?? 0;
    const warlockLevel = payload.caster?.classLevel ?? 3;
    const tempHp = Math.max(1, chaMod + warlockLevel);




    if (source.characterId) {
      const st = await this.charStates.findOne({
        where: { character_id: source.characterId },
      });
      if (st) {
        st.temp_hp = Math.max(st.temp_hp ?? 0, tempHp);
        await this.charStates.save(st);
      }
    }
    source.tempHp = Math.max(source.tempHp ?? 0, tempHp);
    await this.participants.save(source);

    events.push({
      event_type: "dark_ones_blessing_granted",
      actor_participant_id: sourceId,
      data: { tempHp, chaMod, warlockLevel },
    });
    return { resolved: true, events, resolutionPayload: { tempHp } };
  }




  private async handleDarkOnesOwnLuck(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const rolled = this.dice.roll(10);
    events.push({
      event_type: "dark_ones_own_luck_rolled",
      actor_participant_id: sourceId,
      data: { bonus: rolled },
    });
    return { resolved: true, events, resolutionPayload: { bonus: rolled } };
  }






  private async handleBardicInspiration(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const target =
      (opts.targetParticipantId as string) ?? (payload.targets?.[0] as string);
    if (!target) return { resolved: false, events };

    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source?.characterId) return { resolved: false, events };
    const bardLevel = payload.caster?.classLevel ?? 1;
    try {
      const res = await this.bard.grantBardicInspiration(
        sourceId,
        target,
        bardLevel,
      );
      events.push(...res.events);
      return {
        resolved: true,
        events,
        resolutionPayload: {
          dieSize: res.dieSize,
          targetParticipantId: target,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: { featureSlug: "bardic-inspiration", error: msg },
      });
      return { resolved: true, events };
    }
  }




  private async handleCuttingWords(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const target =
      (opts.targetParticipantId as string) ?? (payload.targets?.[0] as string);
    if (!target) return { resolved: false, events };
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source?.characterId) return { resolved: false, events };
    const bardLevel = payload.caster?.classLevel ?? 3;
    try {
      const res = await this.bard.applyCuttingWords(
        sourceId,
        target,
        bardLevel,
      );
      events.push(...res.events);
      return {
        resolved: true,
        events,
        resolutionPayload: {
          dieSize: res.dieSize,
          targetParticipantId: target,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: { featureSlug: "cutting-words", error: msg },
      });
      return { resolved: true, events };
    }
  }




  private async handleCountercharm(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const target =
      (opts.targetParticipantId as string) ??
      (payload.targets?.[0] as string) ??
      sourceId;
    try {
      const res = await this.bard.applyCountercharm(sourceId, target);
      events.push(...res.events);
      return {
        resolved: true,
        events,
        resolutionPayload: { targetParticipantId: target },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: { featureSlug: "countercharm", error: msg },
      });
      return { resolved: true, events };
    }
  }




  private async handleWildShape(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};


    const nested = opts.options as Record<string, unknown> | undefined;
    const monsterSlug =
      (opts.monsterSlug as string) ??
      (opts.targetMonsterSlug as string) ??
      (nested?.monsterSlug as string | undefined) ??
      (nested?.targetMonsterSlug as string | undefined);
    if (!monsterSlug) {
      return { resolved: false, events };
    }
    const classLevel = payload.caster?.classLevel ?? 2;
    const maxCr = classLevel >= 8 ? 1 : classLevel >= 4 ? 0.5 : 0.25;
    try {
      const updated = await this.transformation.enterForm(sourceId, {
        source: "wild-shape",
        monsterSlug,
        durationRoundsTotal: 600,
        retainedAbilities: ["mental-stats", "speech", "class-features"],
        equipmentHandling: "merge",
        revertTriggers: {
          hpZero: true,
          durationEnd: true,
          playerDismiss: true,
          concentrationBroken: false,
        },
      });

      const form = updated.transformationState?.form;
      if (form?.challengeRating != null && form.challengeRating > maxCr) {

        await this.transformation.revertForm(sourceId, "player-dismiss");
        events.push({
          event_type: "class_feature_error",
          actor_participant_id: sourceId,
          data: {
            featureSlug: "wild-shape",
            error: `CR do form (${form.challengeRating}) excede max L${classLevel} (${maxCr}).`,
          },
        });
        return { resolved: true, events };
      }
      events.push({
        event_type: "wild_shape_entered",
        actor_participant_id: sourceId,
        data: {
          monsterSlug,
          formName: form?.formName,
          maxHp: form?.maxHp,
          ac: form?.ac,
          speed: form?.speed,
        },
      });
      return {
        resolved: true,
        events,
        resolutionPayload: { transformedInto: form?.formName },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: { featureSlug: "wild-shape", error: msg },
      });
      return { resolved: true, events };
    }
  }







  private async handleChannelDivinity(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const choice =
      (opts.choice as string) ?? (opts.variant as string) ?? "turn-undead";

    if (choice === "turn-undead") {

      return this.handleTurnUndead(sourceId, payload, events);
    }

    if (choice === "preserve-life") {


      const classLevel = payload.caster?.classLevel ?? 2;
      const pool = 5 * classLevel;
      const assignments = (opts.assignments as Record<string, number>) ?? {};
      let spent = 0;
      for (const [tid, amt] of Object.entries(assignments)) {
        if (amt <= 0 || spent + amt > pool) continue;
        const target = await this.participants.findOne({ where: { id: tid } });
        if (!target) continue;
        if (target.characterId) {
          const st = await this.charStates.findOne({
            where: { character_id: target.characterId },
          });
          if (st) {
            st.current_hp = st.current_hp + amt;
            await this.charStates.save(st);
          }
        } else {
          target.currentHp = Math.min(
            target.maxHp ?? 0,
            (target.currentHp ?? 0) + amt,
          );
          await this.participants.save(target);
        }
        spent += amt;
        events.push({
          event_type: "preserve_life_applied",
          actor_participant_id: sourceId,
          target_participant_id: tid,
          data: { amount: amt, poolRemaining: pool - spent },
        });
      }
      return {
        resolved: true,
        events,
        resolutionPayload: { poolSpent: spent, poolTotal: pool },
      };
    }

    if (choice === "harness-divine-power") {

      const classLevel = payload.caster?.classLevel ?? 2;
      const maxSlotLevel = Math.min(5, Math.floor(classLevel / 2));
      const slotLevel = Math.min((opts.slotLevel as number) ?? 1, maxSlotLevel);
      const source = await this.participants.findOne({
        where: { id: sourceId },
      });
      if (source?.characterId) {
        const st = await this.charStates.findOne({
          where: { character_id: source.characterId },
        });
        if (st) {
          const used =
            (st as unknown as { spell_slots?: Record<string, number> })
              .spell_slots ?? {};
          const key = `level${slotLevel}`;
          if (used[key] > 0) {
            used[key] -= 1;
            (
              st as unknown as { spell_slots?: Record<string, number> }
            ).spell_slots = used;
            await this.charStates.save(st);
            events.push({
              event_type: "harness_divine_power_used",
              actor_participant_id: sourceId,
              data: { slotLevelRegained: slotLevel },
            });
          }
        }
      }
      return { resolved: true, events };
    }


    return { resolved: false, events };
  }




  private async handleArcaneRecovery(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const classLevel = payload.caster?.classLevel ?? 1;
    const budget = Math.ceil(classLevel / 2);
    const assignments = (opts.slotAssignments as Record<string, number>) ?? {
      level1: 1,
    };

    let spent = 0;
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source?.characterId) return { resolved: false, events };
    const st = await this.charStates.findOne({
      where: { character_id: source.characterId },
    });
    if (!st) return { resolved: false, events };

    const slots =
      (st as unknown as { spell_slots?: Record<string, number> }).spell_slots ??
      {};
    const regained: Record<string, number> = {};
    for (const [lvlKey, count] of Object.entries(assignments)) {
      const lvl = parseInt(lvlKey.replace("level", ""), 10);
      if (lvl > 5 || count <= 0) continue;
      const addBudget = lvl * count;
      if (spent + addBudget > budget) continue;
      const currentUsed = slots[lvlKey] ?? 0;
      const toRegain = Math.min(currentUsed, count);
      if (toRegain <= 0) continue;
      slots[lvlKey] = currentUsed - toRegain;
      regained[lvlKey] = toRegain;
      spent += lvl * toRegain;
    }
    (st as unknown as { spell_slots?: Record<string, number> }).spell_slots =
      slots;
    await this.charStates.save(st);

    events.push({
      event_type: "arcane_recovery_used",
      actor_participant_id: sourceId,
      data: { budgetSpent: spent, budgetTotal: budget, regained },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: { budgetSpent: spent, regained },
    };
  }




  private async handleDivineSense(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    const allInEncounter = await this.participants.find({
      where: { encounterId: source.encounterId },
      relations: ["monster"],
    });
    const px = source.positionX ?? 0;
    const py = source.positionY ?? 0;
    const detected: Array<{
      id: string;
      type: string;
      displayName: string;
      distance: number;
    }> = [];
    for (const p of allInEncounter) {
      if (p.id === source.id) continue;
      const mType = (p.monster as unknown as { type?: string })?.type ?? "";
      if (!/undead|celestial|fiend/i.test(mType)) continue;
      const dx = (p.positionX ?? 0) - px;
      const dy = (p.positionY ?? 0) - py;
      const chebyshev = Math.max(Math.abs(dx), Math.abs(dy));
      const ft = chebyshev * 5;
      if (ft <= 60) {
        detected.push({
          id: p.id,
          type: mType,
          displayName: p.displayName,
          distance: ft,
        });
      }
    }
    events.push({
      event_type: "divine_sense_detected",
      actor_participant_id: sourceId,
      data: { detected, rangeFt: 60 },
    });
    return { resolved: true, events, resolutionPayload: { detected } };
  }



  private async handleTurnUndead(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const saveDc = payload.saveDc ?? 10;
    const targets = payload.targets ?? [];
    const results: Array<{ targetId: string; rolled: number; saved: boolean }> =
      [];

    for (const tid of targets) {
      const target = await this.participants.findOne({ where: { id: tid } });
      if (!target) continue;

      const wisMod = this.getAbilityMod(target, "wis");
      const rolled = this.dice.roll(20);
      const total = rolled + wisMod;
      const saved = total >= saveDc;
      results.push({ targetId: tid, rolled, saved });
      events.push({
        event_type: "save_rolled",
        target_participant_id: tid,
        data: {
          ability: "wis",
          dc: saveDc,
          rolled,
          modifier: wisMod,
          total,
          success: saved,
          source: "turn-undead",
        },
      });
      if (!saved) {
        const r = await this.conditionLifecycle.applyCondition(target, {
          slug: "frightened",
          appliedBy: sourceId,
          sourceSpell: "turn-undead",
          sourceConcentration: false,
          saveAbility: "wis",
          saveDc,
          repeatSaveTiming: "end_of_turn",
          durationRoundsRemaining: 10,
        });
        events.push(...r.events);
      }
    }

    return {
      resolved: true,
      events,
      resolutionPayload: { saves: results },
    };
  }

  private async handleRage(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };

    const classLevel = payload.caster?.classLevel ?? 1;
    const rageDamage = this.getRageDamageByLevel(classLevel);


    const r1 = await this.effectInstances.addEffect(source, {
      kind: "damage_resistance",
      sourceFeatureSlug: "rage",
      sourceCasterParticipantId: sourceId,
      payload: { damageTypes: ["bludgeoning", "piercing", "slashing"] },
      expiresAt: { kind: "rounds", value: 10 },
      requiresConcentration: false,
    });
    events.push(...r1.events);


    const r2 = await this.effectInstances.addEffect(source, {
      kind: "self_advantage",
      sourceFeatureSlug: "rage",
      sourceCasterParticipantId: sourceId,
      payload: { scope: "str-check" },
      expiresAt: { kind: "rounds", value: 10 },
      requiresConcentration: false,
    });
    events.push(...r2.events);


    const r3 = await this.effectInstances.addEffect(source, {
      kind: "damage_bonus",
      sourceFeatureSlug: "rage",
      sourceCasterParticipantId: sourceId,
      payload: { amount: rageDamage, scope: "melee" },
      expiresAt: { kind: "rounds", value: 10 },
      requiresConcentration: false,
    });
    events.push(...r3.events);





    if (!(source.conditions ?? []).includes("raging")) {
      source.conditions = [...(source.conditions ?? []), "raging"];
      await this.participants.save(source);
    }

    return {
      resolved: true,
      events,
      resolutionPayload: {
        effectIds: [r1.effect.id, r2.effect.id, r3.effect.id],
        rageDamage,
      },
    };
  }

  private async handleGrapple(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const targetId = payload.targets?.[0];
    if (!targetId) return { resolved: false, events };
    const target = await this.participants.findOne({ where: { id: targetId } });
    if (!target) return { resolved: false, events };

    const saveDc = payload.saveDc ?? 10;
    const strMod = this.getAbilityMod(target, "str");
    const rolled = this.dice.roll(20);
    const total = rolled + strMod;
    const saved = total >= saveDc;
    events.push({
      event_type: "save_rolled",
      target_participant_id: targetId,
      data: {
        ability: "str",
        dc: saveDc,
        rolled,
        modifier: strMod,
        total,
        success: saved,
        source: "grapple",
      },
    });

    if (!saved) {
      const r = await this.conditionLifecycle.applyCondition(target, {
        slug: "grappled",
        appliedBy: sourceId,
        sourceSpell: null,
        sourceConcentration: false,
      });
      events.push(...r.events);
      return {
        resolved: true,
        events,
        resolutionPayload: { saved: false, conditionInstanceId: r.instance.id },
      };
    }
    return { resolved: true, events, resolutionPayload: { saved: true } };
  }

  private async handleShove(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const targetId = payload.targets?.[0];
    if (!targetId) return { resolved: false, events };
    const target = await this.participants.findOne({ where: { id: targetId } });
    if (!target) return { resolved: false, events };

    const saveDc = payload.saveDc ?? 10;
    const strMod = this.getAbilityMod(target, "str");
    const rolled = this.dice.roll(20);
    const total = rolled + strMod;
    const saved = total >= saveDc;
    events.push({
      event_type: "save_rolled",
      target_participant_id: targetId,
      data: {
        ability: "str",
        dc: saveDc,
        rolled,
        modifier: strMod,
        total,
        success: saved,
        source: "shove",
      },
    });

    if (!saved) {
      const outcome =
        (payload.options?.outcome as string | undefined) ?? "prone";
      if (outcome === "prone" || outcome === "pending") {
        const r = await this.conditionLifecycle.applyCondition(target, {
          slug: "prone",
          appliedBy: sourceId,
          sourceSpell: null,
          sourceConcentration: false,
        });
        events.push(...r.events);
        return {
          resolved: true,
          events,
          resolutionPayload: {
            saved: false,
            outcome: "prone",
            conditionInstanceId: r.instance.id,
          },
        };
      }

      events.push({
        event_type: "movement_forced",
        target_participant_id: targetId,
        data: { source: "shove", distanceFt: 5, by: sourceId },
      });
      return {
        resolved: true,
        events,
        resolutionPayload: { saved: false, outcome: "push-5ft" },
      };
    }
    return { resolved: true, events, resolutionPayload: { saved: true } };
  }



  private getAbilityMod(
    p: EncounterParticipantEntity,
    ability: string,
  ): number {
    if (p.type === "monster" && p.monster) {
      const score = (p.monster as any)?.stats?.[ability] ?? 10;
      return Math.floor((score - 10) / 2);
    }



    return 0;
  }

  private getRageDamageByLevel(level: number): number {

    if (level >= 16) return 4;
    if (level >= 9) return 3;
    return 2;
  }
}
