import { Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { DiceService } from "./dice.service";
import { EffectInstanceService } from "./effect-instance.service";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { GameEventData } from "../interfaces/result.type";
import { getMonsterSavingThrowBonus } from "./monster-saving-throw";
import { PersistentAreaService } from "./persistent-area.service";







export type MasterySlug =
  | "cleave"
  | "graze"
  | "nick"
  | "push"
  | "sap"
  | "slow"
  | "topple"
  | "vex";

export interface MasteryContext {
  masterySlug: string;
  attacker: EncounterParticipantEntity;
  target: EncounterParticipantEntity;

  abilityMod: number;

  profBonus: number;

  damageType: string;

  targetSizeOk?: boolean;

  cellSizeFt?: number;

  damageRolledAmount?: number;
}

export interface MasteryOnHitResult {

  applied: MasterySlug[];

  extraDamage: number;

  events: GameEventData[];

  pushedTo?: { x: number; y: number };

  toppleSave?: { roll: number; total: number; dc: number; success: boolean };

  cleaveSecondTarget?: {
    participantId: string;
    damageAmount: number;
    damageType: string;
  };
}

export interface MasteryOnMissResult {

  grazeDamage?: { amount: number; damageType: string };
  events: GameEventData[];
}

@Injectable()
export class WeaponMasteryService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly dice: DiceService,
    private readonly effectInstances: EffectInstanceService,
    private readonly conditionLifecycle: ConditionLifecycleService,
    @Inject(PersistentAreaService)
    private readonly persistentArea?: PersistentAreaService,
  ) {}


  async resolveOnHit(ctx: MasteryContext): Promise<MasteryOnHitResult> {
    const result: MasteryOnHitResult = {
      applied: [],
      extraDamage: 0,
      events: [],
    };
    switch (ctx.masterySlug as MasterySlug) {
      case "sap":
        await this.applySap(ctx, result);
        break;
      case "slow":
        await this.applySlow(ctx, result);
        break;
      case "vex":
        await this.applyVex(ctx, result);
        break;
      case "topple":
        await this.applyTopple(ctx, result);
        break;
      case "push":
        await this.applyPush(ctx, result);
        break;
      case "cleave":
        await this.applyCleave(ctx, result);
        break;
      case "nick":



        result.events.push({
          event_type: "weapon_mastery_triggered",
          actor_participant_id: ctx.attacker.id,
          target_participant_id: ctx.target.id,
          data: {
            masterySlug: "nick",
            note: "Extra attack light disponível dentro da Attack action",
          },
        });
        break;

      case "graze":
        break;
      default:
        break;
    }
    return result;
  }


  resolveOnMiss(ctx: MasteryContext): MasteryOnMissResult {
    const result: MasteryOnMissResult = { events: [] };
    if ((ctx.masterySlug as MasterySlug) !== "graze") return result;
    const amount = Math.max(0, ctx.abilityMod);
    if (amount <= 0) return result;
    result.grazeDamage = { amount, damageType: ctx.damageType };
    result.events.push({
      event_type: "weapon_mastery_triggered",
      actor_participant_id: ctx.attacker.id,
      target_participant_id: ctx.target.id,
      data: {
        masterySlug: "graze",
        grazeDamage: amount,
        damageType: ctx.damageType,
      },
    });
    return result;
  }


  private async applyCleave(
    ctx: MasteryContext,
    result: MasteryOnHitResult,
  ): Promise<void> {

    if (ctx.attacker.cleaveUsedThisTurn) {
      result.events.push({
        event_type: "weapon_mastery_deferred",
        actor_participant_id: ctx.attacker.id,
        target_participant_id: ctx.target.id,
        data: { masterySlug: "cleave", reason: "already_used_this_turn" },
      });
      return;
    }
    if (!ctx.damageRolledAmount || ctx.damageRolledAmount <= 0) return;
    if (ctx.target.positionX == null || ctx.target.positionY == null) return;


    const all = await this.participantRepo.find({
      where: { encounterId: ctx.target.encounterId },
    });
    const adjacent = all.find((p) => {
      if (p.id === ctx.target.id || p.id === ctx.attacker.id) return false;
      if (p.isDefeated) return false;
      if (p.faction === ctx.attacker.faction) return false;
      if (p.positionX == null || p.positionY == null) return false;
      const dx = Math.abs(p.positionX - (ctx.target.positionX ?? 0));
      const dy = Math.abs(p.positionY - (ctx.target.positionY ?? 0));

      return Math.max(dx, dy) <= 1 && dx + dy > 0;
    });

    if (!adjacent) {
      result.events.push({
        event_type: "weapon_mastery_deferred",
        actor_participant_id: ctx.attacker.id,
        target_participant_id: ctx.target.id,
        data: { masterySlug: "cleave", reason: "no_adjacent_hostile" },
      });
      return;
    }


    ctx.attacker.cleaveUsedThisTurn = true;
    await this.participantRepo.save(ctx.attacker);

    result.cleaveSecondTarget = {
      participantId: adjacent.id,
      damageAmount: ctx.damageRolledAmount,
      damageType: ctx.damageType,
    };
    result.applied.push("cleave");
    result.events.push({
      event_type: "weapon_mastery_triggered",
      actor_participant_id: ctx.attacker.id,
      target_participant_id: adjacent.id,
      data: {
        masterySlug: "cleave",
        primaryTargetId: ctx.target.id,
        secondTargetId: adjacent.id,
        damageAmount: ctx.damageRolledAmount,
        damageType: ctx.damageType,
      },
    });
  }


  private async applySap(
    ctx: MasteryContext,
    result: MasteryOnHitResult,
  ): Promise<void> {
    const existing = (ctx.target.effectInstances ?? []).filter(
      (effect) =>
        effect.kind === "self_disadvantage_next_attack" &&
        effect.sourceFeatureSlug === "weapon-mastery:sap",
    );
    for (const effect of existing) {
      await this.effectInstances.removeEffect(
        ctx.target,
        effect.id,
        "manual",
      );
    }
    const { effect, events } = await this.effectInstances.addEffect(
      ctx.target,
      {
        kind: "self_disadvantage_next_attack",
        sourceFeatureSlug: "weapon-mastery:sap",
        sourceCasterParticipantId: ctx.attacker.id,
        payload: { masterySlug: "sap" },
        expiresAt: { kind: "until_consumed" },
        requiresConcentration: false,
      },
    );
    result.applied.push("sap");
    result.events.push(...events);
    result.events.push({
      event_type: "weapon_mastery_triggered",
      actor_participant_id: ctx.attacker.id,
      target_participant_id: ctx.target.id,
      data: { masterySlug: "sap", effectId: effect.id },
    });
  }


  private async applySlow(
    ctx: MasteryContext,
    result: MasteryOnHitResult,
  ): Promise<void> {

    const existing = (ctx.target.effectInstances ?? []).filter(
      (e) =>
        e.kind === "speed_reduction" &&
        e.sourceFeatureSlug === "weapon-mastery:slow",
    );
    for (const e of existing) {
      await this.effectInstances.removeEffect(ctx.target, e.id, "manual");
    }

    const { effect, events } = await this.effectInstances.addEffect(
      ctx.target,
      {
        kind: "speed_reduction",
        sourceFeatureSlug: "weapon-mastery:slow",
        sourceCasterParticipantId: ctx.attacker.id,
        payload: { amount: 10, masterySlug: "slow" },

        expiresAt: { kind: "rounds", value: 1 },
        requiresConcentration: false,
      },
    );
    result.applied.push("slow");
    result.events.push(...events);
    result.events.push({
      event_type: "weapon_mastery_triggered",
      actor_participant_id: ctx.attacker.id,
      target_participant_id: ctx.target.id,
      data: { masterySlug: "slow", effectId: effect.id, speedReductionFt: 10 },
    });
  }


  private async applyVex(
    ctx: MasteryContext,
    result: MasteryOnHitResult,
  ): Promise<void> {
    const { effect, events } = await this.effectInstances.addEffect(
      ctx.attacker,
      {
        kind: "self_advantage_next_attack",
        sourceFeatureSlug: "weapon-mastery:vex",
        sourceCasterParticipantId: ctx.attacker.id,
        payload: { masterySlug: "vex", requiredTargetId: ctx.target.id },
        expiresAt: { kind: "until_consumed" },
        requiresConcentration: false,
      },
    );
    result.applied.push("vex");
    result.events.push(...events);
    result.events.push({
      event_type: "weapon_mastery_triggered",
      actor_participant_id: ctx.attacker.id,
      target_participant_id: ctx.target.id,
      data: {
        masterySlug: "vex",
        effectId: effect.id,
        requiredTargetId: ctx.target.id,
      },
    });
  }


  private async applyTopple(
    ctx: MasteryContext,
    result: MasteryOnHitResult,
  ): Promise<void> {
    const dc = 8 + ctx.profBonus + ctx.abilityMod;
    const { roll, total, mod } = this.rollConSave(ctx.target);
    const success = total >= dc;
    result.toppleSave = { roll, total, dc, success };
    result.events.push({
      event_type: "weapon_mastery_triggered",
      actor_participant_id: ctx.attacker.id,
      target_participant_id: ctx.target.id,
      data: {
        masterySlug: "topple",
        save: { ability: "con", dc, roll, modifier: mod, total, success },
      },
    });
    if (!success) {
      const { events } = await this.conditionLifecycle.applyCondition(
        ctx.target,
        {
          slug: "prone",
          appliedBy: ctx.attacker.id,
          sourceSpell: null,
          durationRoundsRemaining: null,
        },
      );
      result.applied.push("topple");
      result.events.push(...events);
    }
  }


  private async applyPush(
    ctx: MasteryContext,
    result: MasteryOnHitResult,
  ): Promise<void> {
    if (ctx.targetSizeOk === false) return;
    const cellSize = ctx.cellSizeFt ?? 5;
    const cellsToMove = Math.floor(10 / cellSize);
    const ax = ctx.attacker.positionX ?? 0;
    const ay = ctx.attacker.positionY ?? 0;
    const tx = ctx.target.positionX ?? 0;
    const ty = ctx.target.positionY ?? 0;
    const dx = tx - ax;
    const dy = ty - ay;

    if (dx === 0 && dy === 0) return;
    const mag = Math.max(Math.abs(dx), Math.abs(dy));
    const nx = Math.sign(dx) * (Math.abs(dx) / mag >= 0.5 ? 1 : 0);
    const ny = Math.sign(dy) * (Math.abs(dy) / mag >= 0.5 ? 1 : 0);
    const newX = tx + nx * cellsToMove;
    const newY = ty + ny * cellsToMove;
    ctx.target.positionX = newX;
    ctx.target.positionY = newY;
    await this.participantRepo.save(ctx.target);
    if (this.persistentArea) {
      result.events.push(
        ...(await this.persistentArea.removeLocationBoundConditionsOutsideAreas(
          ctx.target,
          { x: newX, y: newY },
        )),
      );
    }
    result.applied.push("push");
    result.pushedTo = { x: newX, y: newY };
    result.events.push({
      event_type: "weapon_mastery_triggered",
      actor_participant_id: ctx.attacker.id,
      target_participant_id: ctx.target.id,
      data: {
        masterySlug: "push",
        from: { x: tx, y: ty },
        to: { x: newX, y: newY },
        distanceFt: cellsToMove * cellSize,
      },
    });
  }


  private rollConSave(target: EncounterParticipantEntity): {
    roll: number;
    total: number;
    mod: number;
  } {
    let mod = 0;
    if (target.type === "monster" && target.monster) {
      mod = getMonsterSavingThrowBonus(
        target.monster as unknown as Record<string, unknown>,
        "con",
      );
    }

    const roll = this.dice.roll(20);
    return { roll, total: roll + mod, mod };
  }
}
