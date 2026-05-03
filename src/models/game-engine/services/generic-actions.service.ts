import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import {
  GameErrorCode,
  GameResult,
  failure,
  success,
  GameEventData,
} from "../interfaces/result.type";
import { DiceService } from "./dice.service";
import { ConditionEffectsService } from "./condition-effects.service";
import type {
  ActionStep,
  ReadyTrigger,
  ReadiedAction,
  PlannedActionStep,
} from "../interfaces/combat.interfaces";
import type { GenericActionDto } from "../dto/generic-action.dto";

/**
 * Spec 003 T030 — executor das 8 ações genéricas PHB (cap. 9 "Actions in Combat").
 *
 * Cada handler segue o contrato:
 *   - Valida pré-requisitos (turno, action economy, condições).
 *   - Aplica mutação na EncounterParticipantEntity (flags, conditions, HP).
 *   - Emite eventos de log.
 *   - Retorna `ActionStep` com o que foi feito.
 *
 * Regras específicas:
 *   - Dodge/Help/Hide/Ready setam flags na entity (campos `dodging*`, `helping*`, `readiedAction`).
 *   - Search/Use Object não criam flag — só emitem evento + side-effect (revelação, inventário).
 *   - Dash/Disengage reusam lógica já existente em combat.service.
 *   - Use Object tem integração pendente com InventoryService — hoje aplica só stub
 *     para poções de cura por slug conhecido. Integração completa fica pra 004.
 */
@Injectable()
export class GenericActionsService {
  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly diceService: DiceService,
    private readonly conditionEffects: ConditionEffectsService,
  ) {}

  async execute(
    encounterId: string,
    dto: GenericActionDto,
  ): Promise<GameResult<ExecuteResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure(GameErrorCode.ENCOUNTER_NOT_FOUND);
    if (encounter.status !== "active")
      return failure(GameErrorCode.ENCOUNTER_NOT_ACTIVE);

    const participant = await this.participantRepo.findOne({
      where: { id: dto.participantId },
    });
    if (!participant) return failure(GameErrorCode.PARTICIPANT_NOT_FOUND);

    // É o turno dele?
    if (encounter.turnOrder[encounter.currentTurnIndex] !== participant.id)
      return failure(GameErrorCode.NOT_YOUR_TURN);

    // Condições que impedem ação (incapacitated/stunned/...) — só bloqueia as
    // que requerem ação real. Dash/Disengage/Hide/Help/Ready/Search/UseObject
    // são todas ações ou bonus actions.
    if (!this.conditionEffects.canTakeAction(participant.conditions ?? [])) {
      return failure(GameErrorCode.CONDITION_PREVENTS_ACTION);
    }

    // Ação já usada?
    if (participant.actionUsed) {
      return failure(GameErrorCode.NO_ACTION_AVAILABLE);
    }

    switch (dto.kind) {
      case "dodge":
        return this.handleDodge(participant);
      case "dash":
        return this.handleDash(participant);
      case "disengage":
        return this.handleDisengage(participant);
      case "help":
        return this.handleHelp(participant, dto);
      case "hide":
        return this.handleHide(participant);
      case "ready":
        return this.handleReady(participant, dto, encounter.currentRound);
      case "search":
        return this.handleSearch(participant, dto);
      case "use-object":
        return this.handleUseObject(participant, dto);
      default:
        return failure(GameErrorCode.INVALID_PAYLOAD);
    }
  }

  // --- Handlers ---

  private async handleDodge(
    p: EncounterParticipantEntity,
  ): Promise<GameResult<ExecuteResult>> {
    p.dodgingUntilTurnOfParticipantId = p.id;
    p.actionUsed = true;
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "dodge",
      payload: { participantId: p.id },
      result: {
        ok: true,
        summary: `${p.displayName} está esquivando até o próximo turno`,
        events: [
          {
            type: "dodge_taken",
            participantId: p.id,
            expiresAt: `next_turn_of:${p.id}`,
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };

    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("dodge_taken", p.id),
    ]);
  }

  private async handleDash(
    p: EncounterParticipantEntity,
  ): Promise<GameResult<ExecuteResult>> {
    if (p.hasDashed) {
      return failure(GameErrorCode.NO_ACTION_AVAILABLE);
    }
    p.hasDashed = true;
    p.actionUsed = true;
    // Dobra o movimento restante — a speed base vem de MovementService
    // no caller de turn-actions; aqui só marcamos a flag e o combat.service
    // consulta hasDashed ao calcular remainingMovement.
    if (p.movementRemaining != null) {
      p.movementRemaining = p.movementRemaining * 2;
    }
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "dash",
      payload: { participantId: p.id },
      result: {
        ok: true,
        summary: `${p.displayName} usou Disparada (movimento dobrado)`,
        events: [{ type: "dash_taken", participantId: p.id }],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("dash_taken", p.id),
    ]);
  }

  private async handleDisengage(
    p: EncounterParticipantEntity,
  ): Promise<GameResult<ExecuteResult>> {
    if (p.hasDisengaged) {
      return failure(GameErrorCode.NO_ACTION_AVAILABLE);
    }
    p.hasDisengaged = true;
    p.actionUsed = true;
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "disengage",
      payload: { participantId: p.id },
      result: {
        ok: true,
        summary: `${p.displayName} se desengajou (imune a attacks of opportunity neste turno)`,
        events: [{ type: "disengage_taken", participantId: p.id }],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("disengage_taken", p.id),
    ]);
  }

  private async handleHelp(
    p: EncounterParticipantEntity,
    dto: GenericActionDto,
  ): Promise<GameResult<ExecuteResult>> {
    if (!dto.allyParticipantId || !dto.targetParticipantId) {
      return failure(GameErrorCode.INVALID_PAYLOAD);
    }
    const ally = await this.participantRepo.findOne({
      where: { id: dto.allyParticipantId },
    });
    const target = await this.participantRepo.findOne({
      where: { id: dto.targetParticipantId },
    });
    if (!ally || !target) return failure(GameErrorCode.PARTICIPANT_NOT_FOUND);
    if (ally.faction !== p.faction)
      return failure(GameErrorCode.INVALID_TARGET);
    if (target.faction === p.faction)
      return failure(GameErrorCode.INVALID_TARGET);

    p.helpingAllyParticipantId = ally.id;
    p.helpingTargetParticipantId = target.id;
    p.helpingUntilTurnOfParticipantId = p.id;
    p.actionUsed = true;
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "help",
      payload: {
        participantId: p.id,
        allyParticipantId: ally.id,
        targetParticipantId: target.id,
      },
      result: {
        ok: true,
        summary: `${p.displayName} está ajudando ${ally.displayName} contra ${target.displayName}`,
        events: [
          {
            type: "help_given",
            participantId: p.id,
            allyParticipantId: ally.id,
            targetParticipantId: target.id,
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("help_given", p.id, {
        ally: ally.id,
        target: target.id,
      }),
    ]);
  }

  private async handleHide(
    p: EncounterParticipantEntity,
  ): Promise<GameResult<ExecuteResult>> {
    // Stealth do ator (DEX + proficiência — aqui usamos modificador simples da entity;
    // cálculo RAW completo com proficiências de skill fica em 004).
    // Usa 10 como Passive Perception default pra inimigos — modelo simplificado
    // descrito em research.md D11. Sight system completo é 005.
    const stealthRoll = this.diceService.rollExpression("1d20").total;
    const stealthMod = 3;
    const stealthTotal = stealthRoll + stealthMod;
    const passivePerception = 10;

    const conditions = [...(p.conditions ?? [])];
    let summary: string;
    const events: Array<{ type: string; [k: string]: unknown }> = [
      {
        type: "stealth_roll",
        participantId: p.id,
        roll: stealthRoll,
        modifier: stealthMod,
        total: stealthTotal,
        dc: passivePerception,
      },
    ];

    if (stealthTotal >= passivePerception) {
      if (!conditions.includes("hidden")) conditions.push("hidden");
      p.conditions = conditions;
      summary = `${p.displayName} escondeu-se (Stealth ${stealthTotal} vs Passive Perception ${passivePerception}): sucesso`;
      events.push({
        type: "condition_applied",
        participantId: p.id,
        condition: "hidden",
      });
    } else {
      summary = `${p.displayName} tentou esconder-se (Stealth ${stealthTotal} vs Passive Perception ${passivePerception}): falhou`;
    }

    p.actionUsed = true;
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "hide",
      payload: { participantId: p.id },
      result: { ok: true, summary, events },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("stealth_roll", p.id, { roll: stealthTotal }),
    ]);
  }

  private async handleReady(
    p: EncounterParticipantEntity,
    dto: GenericActionDto,
    _round: number,
  ): Promise<GameResult<ExecuteResult>> {
    if (!dto.trigger || !dto.readiedAction) {
      return failure(GameErrorCode.INVALID_READY_TRIGGER);
    }
    // Validação adicional dos campos condicionais (class-validator cobre, mas
    // dupla checagem pra variantes).
    const trigger = dto.trigger as ReadyTrigger;
    if (
      trigger.kind === "enemy_enters_range" &&
      (trigger.rangeFt == null || trigger.rangeFt <= 0)
    ) {
      return failure(GameErrorCode.INVALID_READY_TRIGGER);
    }
    if (trigger.kind === "enemy_attacks_ally" && !trigger.allyParticipantId) {
      return failure(GameErrorCode.INVALID_READY_TRIGGER);
    }

    const readiedAction: ReadiedAction = {
      trigger,
      actionDescriptor: {
        kind: dto.readiedAction.kind,
        ...(dto.readiedAction.kind === "attack"
          ? {
              actionName: dto.readiedAction.actionName ?? "",
              targetParticipantIds:
                dto.readiedAction.targetParticipantIds ?? [],
            }
          : { to: dto.readiedAction.to ?? { x: 0, y: 0 } }),
      } as PlannedActionStep,
      armedAtTurnOfParticipantId: p.id,
    };

    p.readiedAction = readiedAction;
    p.actionUsed = true;
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "ready",
      payload: {
        participantId: p.id,
        trigger,
        readiedAction: dto.readiedAction,
      },
      result: {
        ok: true,
        summary: `${p.displayName} preparou ação (gatilho: ${trigger.kind})`,
        events: [{ type: "ready_armed", participantId: p.id, trigger }],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("ready_armed", p.id, { trigger }),
    ]);
  }

  private async handleSearch(
    p: EncounterParticipantEntity,
    dto: GenericActionDto,
  ): Promise<GameResult<ExecuteResult>> {
    const ability = dto.ability ?? "perception";
    // Modificador simples (RAW usa skill proficiency — integração em 004).
    const roll = this.diceService.rollExpression("1d20").total;
    const mod = ability === "perception" ? 2 : 1;
    const total = roll + mod;

    p.actionUsed = true;
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "search",
      payload: { participantId: p.id, ability },
      result: {
        ok: true,
        summary: `${p.displayName} procurou (${ability}): ${total} (${roll}+${mod})`,
        events: [
          {
            type: "search_roll",
            participantId: p.id,
            ability,
            roll,
            modifier: mod,
            total,
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("search_roll", p.id, { ability, total }),
    ]);
  }

  private async handleUseObject(
    p: EncounterParticipantEntity,
    dto: GenericActionDto,
  ): Promise<GameResult<ExecuteResult>> {
    if (!dto.objectRef) return failure(GameErrorCode.INVALID_PAYLOAD);

    // Integração completa com InventoryService fica pra 004. Aqui cobrimos o
    // caso comum (poção de cura) via slug; outros itens retornam NOT_USABLE.
    const slug = dto.objectRef.slug;
    let appliedSummary: string;
    const events: Array<{ type: string; [k: string]: unknown }> = [];

    if (slug === "potion-of-healing") {
      const healing = this.diceService.rollExpression("2d4+2").total;
      p.currentHp = Math.min(
        (p.currentHp ?? 0) + healing,
        p.maxHp ?? (p.currentHp ?? 0) + healing,
      );
      appliedSummary = `${p.displayName} usou Poção de Cura (+${healing} HP)`;
      events.push(
        { type: "item_used", participantId: p.id, slug },
        { type: "healing_applied", participantId: p.id, amount: healing },
      );
    } else {
      return failure(GameErrorCode.ITEM_NOT_USABLE);
    }

    p.actionUsed = true;
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "use-object",
      payload: { participantId: p.id, objectRef: dto.objectRef },
      result: { ok: true, summary: appliedSummary, events },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("item_used", p.id, { slug }),
    ]);
  }

  // --- Helpers ---

  private snapshotState(p: EncounterParticipantEntity) {
    return {
      actionUsed: p.actionUsed,
      bonusUsed: p.bonusActionUsed,
      movementRemaining: p.movementRemaining ?? 0,
      reactionUsed: p.reactionsUsed > 0,
      hp: { current: p.currentHp ?? 0, max: p.maxHp ?? 0 },
      conditions: p.conditions ?? [],
      dyingState: p.dyingState,
    };
  }

  private toGameEvent(
    type: string,
    actorId: string,
    data: Record<string, unknown> = {},
  ): GameEventData {
    return {
      event_type: type,
      actor_participant_id: actorId,
      data,
    };
  }
}

export interface ExecuteResult {
  step: ActionStep;
  finalState: {
    actionUsed: boolean;
    bonusUsed: boolean;
    movementRemaining: number;
    reactionUsed: boolean;
    hp: { current: number; max: number };
    conditions: string[];
    dyingState: "none" | "dying" | "stable" | "dead";
  };
}
