import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { DiceService } from "./dice.service";
import { EffectInstanceService } from "./effect-instance.service";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { GameEventData } from "../interfaces/result.type";
import { getAbilityModifier } from "src/shared/srd-utils";

// Spec 012 Fase 0 — Weapon Mastery (XPHB 2024)
//
// 8 properties, cada uma com timing e efeito mecânico distintos. Fase 1 cobre
// post-hit/miss: Graze · Sap · Slow · Topple · Vex · Push.
// Fase 2 (deferred): Cleave (second attack in chain), Nick (TWF action flow).

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
  /** Ability modifier used for the attack roll (STR or DEX, depending on weapon). */
  abilityMod: number;
  /** Attacker's proficiency bonus (for Topple save DC). */
  profBonus: number;
  /** Damage type of the weapon — used by Graze when dealing ability-mod damage. */
  damageType: string;
  /** Weapon size / target size — only Push requires "Large or smaller". Default lenient. */
  targetSizeOk?: boolean;
  /** Grid cell size (ft). Used by Push to convert 10ft → cells. */
  cellSizeFt?: number;
  /** Cleave — dano rolado no hit primário. Cleave aplica mesmo total num 2º alvo. */
  damageRolledAmount?: number;
}

export interface MasteryOnHitResult {
  /** Slug do efeito aplicado (p/ log). */
  applied: MasterySlug[];
  /** Damage bonus extra from mastery (só Graze on-hit normalmente = 0). */
  extraDamage: number;
  /** Eventos pra emitir via EventService. */
  events: GameEventData[];
  /** Push: nova posição do target (se aplicável). */
  pushedTo?: { x: number; y: number };
  /** Topple: resultado do CON save (applied prone só em falha). */
  toppleSave?: { roll: number; total: number; dc: number; success: boolean };
  /**
   * Cleave (RAW 2024) — se houver alvo adjacente ao primário (5ft Chebyshev,
   * mesma faction inimiga), retorna descritor pra combat.service aplicar damage.
   * Service não mexe HP direto; responsabilidade fica no caller.
   */
  cleaveSecondTarget?: {
    participantId: string;
    damageAmount: number;
    damageType: string;
  };
}

export interface MasteryOnMissResult {
  /** Graze damage se aplicável. */
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
  ) {}

  /**
   * Ponto de entrada pós-hit. Aplica o efeito correspondente ao masterySlug.
   * Chamado em combat.service.resolveAttack depois de `damage_applied`, antes
   * de persistir attacker/target, pra que mudanças (conditions/effects/pos) já
   * fiquem na mesma transação lógica.
   */
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
        // Nick é "action economy rider" — expõe via actions.service + flag
        // nickUsedThisTurn (gerenciado em combat.service quando extra attack
        // light é feito). Aqui só emite marker.
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
      // Graze só em miss — ignora em hit
      case "graze":
        break;
      default:
        break;
    }
    return result;
  }

  /**
   * Ponto de entrada pós-miss. Só Graze entra aqui.
   */
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

  /**
   * Cleave (RAW 2024) — hit melee com weapon 2-handed + Cleave causa o mesmo
   * damage total num 2º alvo adjacente (5ft Chebyshev) ao primário. 1× por turno.
   * Service apenas identifica o 2º alvo; combat.service aplica damage (mantém
   * responsabilidade de HP/defeat/events de damage_applied no caller).
   */
  private async applyCleave(
    ctx: MasteryContext,
    result: MasteryOnHitResult,
  ): Promise<void> {
    // Limite 1×/turno
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

    // Busca 2º alvo adjacente (hostil, não o primário, não o próprio attacker)
    const all = await this.participantRepo.find({
      where: { encounterId: ctx.target.encounterId },
    });
    const adjacent = all.find((p) => {
      if (p.id === ctx.target.id || p.id === ctx.attacker.id) return false;
      if (p.isDefeated) return false;
      if (p.faction === ctx.attacker.faction) return false; // só hostis
      if (p.positionX == null || p.positionY == null) return false;
      const dx = Math.abs(p.positionX - (ctx.target.positionX ?? 0));
      const dy = Math.abs(p.positionY - (ctx.target.positionY ?? 0));
      // Chebyshev distance 1 = adjacente em grid quadrada (inclui diagonais)
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

    // Marca flag per-turn + retorna descritor pro combat.service aplicar damage
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

  /**
   * Sap — alvo tem disadvantage no próximo attack roll antes do início do meu
   * próximo turno. Usa `self_disadvantage_next_attack` (one-shot consumido no
   * proximo attack do target).
   */
  private async applySap(
    ctx: MasteryContext,
    result: MasteryOnHitResult,
  ): Promise<void> {
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

  /**
   * Slow — Speed do alvo reduz em 10ft até o início do meu próximo turno.
   * Não empilha (RAW: "If you hit a creature with this weapon"). Impl: se ja tem
   * um speed_reduction aplicado por Slow, substitui (remove antigo, adiciona novo).
   */
  private async applySlow(
    ctx: MasteryContext,
    result: MasteryOnHitResult,
  ): Promise<void> {
    // Remove existing slow mastery stacking
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
        // Dura até o início do próximo turno do attacker (approx: 1 round, decresce no tick)
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

  /**
   * Vex — advantage no meu próximo attack roll contra mesmo alvo antes do fim
   * do meu próximo turno. Usa `self_advantage_next_attack` com payload
   * `requiredTargetId` pra restringir ao alvo específico.
   */
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

  /**
   * Topple — alvo faz CON save DC 8 + prof + abilityMod. Falha = Prone.
   */
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

  /**
   * Push — empurra o alvo até 10ft pra longe do attacker (Large ou menor).
   * Assume grid 5ft/cell. Direção: vetor attacker→target normalizado,
   * arredondado pra células cardinais/diagonais.
   */
  private async applyPush(
    ctx: MasteryContext,
    result: MasteryOnHitResult,
  ): Promise<void> {
    if (ctx.targetSizeOk === false) return; // Large+ creatures ignoram Push
    const cellSize = ctx.cellSizeFt ?? 5;
    const cellsToMove = Math.floor(10 / cellSize); // 2 cells @ 5ft
    const ax = ctx.attacker.positionX ?? 0;
    const ay = ctx.attacker.positionY ?? 0;
    const tx = ctx.target.positionX ?? 0;
    const ty = ctx.target.positionY ?? 0;
    const dx = tx - ax;
    const dy = ty - ay;
    // Normalize to -1/0/1 (grid-friendly); default (0,0) → no push possible
    if (dx === 0 && dy === 0) return;
    const mag = Math.max(Math.abs(dx), Math.abs(dy));
    const nx = Math.sign(dx) * (Math.abs(dx) / mag >= 0.5 ? 1 : 0);
    const ny = Math.sign(dy) * (Math.abs(dy) / mag >= 0.5 ? 1 : 0);
    const newX = tx + nx * cellsToMove;
    const newY = ty + ny * cellsToMove;
    ctx.target.positionX = newX;
    ctx.target.positionY = newY;
    await this.participantRepo.save(ctx.target);
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

  /**
   * Roll inline CON save para o target (PC ou monstro). Versão simplificada:
   * usa monster.constitution + proficiency_bonus quando monster; pra PC usa
   * stat_block aproximado (10 default) — ideal seria delegar pra SavingThrowService,
   * mas isso ficaria dependente de userId (que não temos aqui). Como Topple
   * é 1 save simples sem conditions, a aproximação é aceitável por enquanto.
   */
  private rollConSave(target: EncounterParticipantEntity): {
    roll: number;
    total: number;
    mod: number;
  } {
    let mod = 0;
    if (target.type === "monster" && target.monster) {
      const m = target.monster as unknown as {
        constitution?: number;
        proficiency_bonus?: number;
        proficiencies?: Array<{ type?: string; name?: string }>;
      };
      const con = m.constitution ?? 10;
      mod = getAbilityModifier(con);
      const profs = Array.isArray(m.proficiencies) ? m.proficiencies : [];
      const hasProf = profs.some(
        (p) =>
          p?.type === "saving-throw" &&
          (p?.name ?? "").toLowerCase().includes("con"),
      );
      if (hasProf) mod += m.proficiency_bonus ?? 0;
    }
    // PC: delegar save seria ideal; por ora usa 0 (conservador — fica como debt).
    // TODO Fase 1.1: delegar pra SavingThrowService quando tiver userId disponível.
    const roll = this.dice.roll(20);
    return { roll, total: roll + mod, mod };
  }
}
