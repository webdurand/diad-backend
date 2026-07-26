import { Injectable } from "@nestjs/common";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import {
  failure,
  GameErrorCode,
  GameResult,
  success,
} from "../interfaces/result.type";
import type {
  ActionStep,
  PlannedActionStep,
  TurnExecutionResult,
} from "../interfaces/combat.interfaces";
import { AiTurnExecutor } from "./ai-turn-executor.interface";
import { EncounterSnapshotService } from "./encounter-snapshot.service";
import { CombatService } from "./combat.service";
import { GenericActionsService } from "./generic-actions.service";
import { MovementService } from "./movement.service";
import { SpellCastingService } from "./spell-casting.service";
import { ReadyActionService } from "./ready-action.service";
import type { GenericActionDto } from "../dto/generic-action.dto";
import { EventService } from "./event.service";


@Injectable()
export class AiTurnService {
  private readonly inFlightTurns = new Map<
    string,
    Promise<GameResult<TurnExecutionResult>>
  >();

  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly executor: AiTurnExecutor,
    private readonly snapshotService: EncounterSnapshotService,
    private readonly combatService: CombatService,
    private readonly genericActionsService: GenericActionsService,
    private readonly movementService: MovementService,
    private readonly spellCastingService: SpellCastingService,
    private readonly readyActionService: ReadyActionService,
    private readonly eventService: EventService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(AiTurnService.name);
  }

  async executeAiTurn(
    encounterId: string,
    participantId: string,
    authUserId: string,
  ): Promise<GameResult<TurnExecutionResult>> {
    const key = `${encounterId}:${participantId}`;
    const existing = this.inFlightTurns.get(key);
    if (existing) return existing;

    let operation: Promise<GameResult<TurnExecutionResult>>;
    operation = this.executeAiTurnInternal(
      encounterId,
      participantId,
      authUserId,
    ).finally(() => {
      if (this.inFlightTurns.get(key) === operation) {
        this.inFlightTurns.delete(key);
      }
    });
    this.inFlightTurns.set(key, operation);
    return operation;
  }

  private async executeAiTurnInternal(
    encounterId: string,
    participantId: string,
    authUserId: string,
  ): Promise<GameResult<TurnExecutionResult>> {
    const start = Date.now();

    this.logger.info("ai.turn.start", {
      "encounter.id": encounterId,
      "participant.id": participantId,
    });

    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) {
      this.logger.warn("ai.turn.fail", {
        "fail.reason": "encounter_not_found",
        "encounter.id": encounterId,
      });
      return failure(GameErrorCode.ENCOUNTER_NOT_FOUND);
    }
    if (encounter.status !== "active") {
      this.logger.warn("ai.turn.fail", {
        "fail.reason": "encounter_not_active",
        "encounter.id": encounterId,
        "encounter.status": encounter.status,
      });
      return failure(GameErrorCode.ENCOUNTER_NOT_ACTIVE);
    }

    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant) {
      this.logger.warn("ai.turn.fail", {
        "fail.reason": "participant_not_found",
        "participant.id": participantId,
      });
      return failure(GameErrorCode.PARTICIPANT_NOT_FOUND);
    }






    if (
      participant.lastAiTurnRound === encounter.currentRound &&
      participant.lastAiTurnResult
    ) {
      const cachedSteps =
        (participant.lastAiTurnResult as { steps?: Array<{ kind?: string }> })
          .steps ?? [];
      const hasUsefulStep = cachedSteps.some(
        (s) =>
          s.kind === "attack" ||
          s.kind === "move" ||
          s.kind === "cast-spell" ||
          s.kind === "use-object" ||
          s.kind === "help",
      );
      if (hasUsefulStep) {
        this.logger.info("ai.turn.cache_hit", {
          "participant.id": participantId,
          "encounter.round": encounter.currentRound,
          "cached.steps": cachedSteps,
        });
        return success(participant.lastAiTurnResult);
      }
      this.logger.info("ai.turn.cache_discard", {
        "participant.id": participantId,
        "encounter.round": encounter.currentRound,
        "cached.steps": cachedSteps,
        reason: "degenerated_steps",
      });
    }

    if (participant.controlledBy !== "ai") {
      this.logger.warn("ai.turn.fail", {
        "fail.reason": "not_ai_controlled",
        "participant.id": participantId,
        "participant.controlled_by": participant.controlledBy,
      });
      return failure(GameErrorCode.NOT_AI_CONTROLLED);
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== participant.id) {
      this.logger.warn("ai.turn.fail", {
        "fail.reason": "not_your_turn",
        "participant.id": participantId,
        "encounter.current_turn_index": encounter.currentTurnIndex,
        "encounter.turn_owner_id":
          encounter.turnOrder[encounter.currentTurnIndex],
      });
      return failure(GameErrorCode.NOT_YOUR_TURN);
    }

    const automaticSteps: ActionStep[] = [];
    const isProne =
      (participant.conditions ?? []).includes("prone") ||
      (participant.conditionInstances ?? []).some(
        (condition) => condition.slug === "prone",
      );
    if (isProne) {
      const stoodUp = await this.movementService.standUp(
        encounter.id,
        participant.id,
        authUserId,
      );
      if (stoodUp.ok) {
        if (stoodUp.events?.length) {
          await this.eventService.emit(
            encounter.sessionId,
            encounter.id,
            stoodUp.events,
          );
        }
        automaticSteps.push({
          kind: "stand-up",
          payload: {},
          result: {
            ok: true,
            summary: `Levantou-se (${stoodUp.value.movementSpent}ft de movimento)`,
            events: (stoodUp.events ?? []).map((event) => ({
              type: event.event_type,
            })),
          },
          timestamp: new Date().toISOString(),
        });
      }
    }


    const snapRes = await this.snapshotService.build(encounterId, authUserId);
    if (!snapRes.ok) {
      this.logger.warn("ai.turn.fail", {
        "fail.reason": "snapshot_build_failed",
        "encounter.id": encounterId,
        "error.code": snapRes.code,
      });
      return snapRes;
    }





    const monsterPart = snapRes.value.participants.find(
      (p) => p.id === participantId,
    );
    const enemiesAlive = snapRes.value.participants.filter(
      (p) =>
        p.faction !== monsterPart?.faction &&
        p.dyingState !== "dead" &&
        p.hp.current > 0,
    );
    this.logger.info("ai.turn.snapshot", {
      "encounter.id": encounterId,
      "encounter.round": encounter.currentRound,
      "encounter.current_turn_index": encounter.currentTurnIndex,
      "snapshot.participants_count": snapRes.value.participants.length,
      "monster.name": monsterPart?.displayName ?? null,
      "monster.position": monsterPart?.position ?? null,
      "monster.hp_current": monsterPart?.hp?.current ?? null,
      "monster.hp_max": monsterPart?.hp?.max ?? null,
      "monster.faction": monsterPart?.faction ?? null,
      "monster.actions_count": monsterPart?.statblockRef?.actions?.length ?? 0,
      "snapshot.enemies_alive": enemiesAlive.length,
    });

    this.logger.info("ai.turn.participants_breakdown", {
      participants: snapRes.value.participants.map((p) => ({
        id: p.id,
        name: p.displayName,
        type: p.type,
        faction: p.faction,
        "hp.current": p.hp?.current,
        "hp.max": p.hp?.max,
        "dying.state": p.dyingState,
        position: p.position,
      })),
    });


    const planRes = await this.executor.executeTurn(
      snapRes.value,
      participantId,
    );
    if (!planRes.ok) {
      this.logger.warn("ai.turn.fail", {
        "fail.reason": "executor_failed",
        "encounter.id": encounterId,
        "participant.id": participantId,
        "error.code": planRes.code,
      });
      if (planRes.code === GameErrorCode.AI_TIMEOUT) {
        return this.fallbackEndTurn(
          encounter,
          participant,
          start,
          "ai_timeout",
        );
      }
      return planRes;
    }


    this.logger.info("ai.turn.steps_planned", {
      "participant.id": participantId,
      "encounter.round": encounter.currentRound,
      "steps.count": planRes.value.steps.length,
      steps: planRes.value.steps,
    });
    const executedSteps: ActionStep[] = [...automaticSteps];
    const totalAttackSteps = planRes.value.steps.filter(
      (s) => s.kind === "attack",
    ).length;
    const isMultiattackPlan = totalAttackSteps > 1;
    let attackStepIndex = 0;
    for (const step of planRes.value.steps) {
      const isSubAttack =
        step.kind === "attack" && (isMultiattackPlan || attackStepIndex > 0);
      const executed = await this.applyStep(
        encounter,
        participantId,
        step,
        authUserId,
        isSubAttack,
      );
      if (step.kind === "attack") attackStepIndex++;
      executedSteps.push(executed);
      this.logger.info("ai.turn.step_executed", {
        "step.kind": step.kind,
        "step.ok": executed.result.ok,
        "step.summary": executed.result.summary,
        "step.error.code": executed.result.error?.code ?? null,
      });


      if (!executed.result.ok && step.kind !== "end-turn") {
        this.logger.warn("ai.turn.step_failed", {
          "step.kind": step.kind,
          "step.error.code": executed.result.error?.code,
          "step.summary": executed.result.summary,
        });
        break;
      }
      if (
        step.kind === "attack" &&
        executed.result.ok &&
        executed.result.events.some(
          (event) => event.targetDefeated === true,
        )
      ) {
        break;
      }
    }

    if (isMultiattackPlan) {
      const ended = await this.participantRepo.findOne({
        where: { id: participantId },
      });
      if (ended && !ended.actionUsed) {
        ended.actionUsed = true;
        await this.participantRepo.save(ended);
      }

      const lastDamagingAttack = executedSteps
        .flatMap((executedStep) =>
          executedStep.kind === "attack" ? executedStep.result.events : [],
        )
        .reverse()
        .find((event) => {
          const attack = event as {
            type?: string;
            hit?: boolean;
            damageDealt?: number;
            targetDefeated?: boolean;
          };
          return (
            attack.type === "attack_resolved" &&
            attack.hit === true &&
            (attack.damageDealt ?? 0) > 0
          );
        }) as
        | {
            actionName?: string;
            targetParticipantId?: string;
            damageDealt?: number;
            damageType?: string | null;
            targetHpBefore?: number | null;
            targetHpAfter?: number | null;
            targetDefeated?: boolean;
          }
        | undefined;
      if (
        lastDamagingAttack?.targetParticipantId &&
        lastDamagingAttack.targetHpAfter != null
      ) {
        await this.combatService.offerPostSequenceReaction(encounter.id, {
          attackerParticipantId: participantId,
          targetParticipantId: lastDamagingAttack.targetParticipantId,
          incomingDamage: lastDamagingAttack.damageDealt ?? 0,
          damageType: lastDamagingAttack.damageType ?? "",
          targetHpBefore: lastDamagingAttack.targetHpBefore ?? undefined,
          targetHpAfter: lastDamagingAttack.targetHpAfter,
          targetDefeated: lastDamagingAttack.targetDefeated,
          ownerUserId: authUserId,
          actionName: lastDamagingAttack.actionName,
          emitEvents: true,
        });
      }
    }


    if (!executedSteps.some((s) => s.kind === "end-turn")) {
      const endRes = await this.combatService.endTurn(encounter.id);
      executedSteps.push({
        kind: "end-turn",
        payload: {},
        result: {
          ok: endRes.ok,
          summary: endRes.ok
            ? "Turno encerrado"
            : ((endRes as { error?: string }).error ?? "Falhou"),
          events: [{ type: "turn_ended", participantId }],
        },
        timestamp: new Date().toISOString(),
      });
    }

    const finalParticipant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    const result: TurnExecutionResult = {
      steps: executedSteps,
      finalState: {
        actionUsed: finalParticipant?.actionUsed ?? true,
        bonusUsed: finalParticipant?.bonusActionUsed ?? false,
        movementRemaining: finalParticipant?.movementRemaining ?? 0,
        reactionUsed: (finalParticipant?.reactionsUsed ?? 0) > 0,
        hp: {
          current: finalParticipant?.currentHp ?? 0,
          max: finalParticipant?.maxHp ?? 0,
        },
        conditions: finalParticipant?.conditions ?? [],
        dyingState: finalParticipant?.dyingState ?? "none",
      },
      tookMs: Date.now() - start,
      rationale: planRes.value.rationale,
      llmCostUsd: planRes.value.llmCostUsd,
    };


    if (finalParticipant) {
      finalParticipant.lastAiTurnRound = encounter.currentRound;
      finalParticipant.lastAiTurnResult = result;
      await this.participantRepo.save(finalParticipant);
    }

    return success(result);
  }

  private async applyStep(
    encounter: EncounterEntity,
    participantId: string,
    step: PlannedActionStep,
    authUserId: string,
    isSubAttack: boolean = false,
  ): Promise<ActionStep> {
    const ts = new Date().toISOString();
    try {
      switch (step.kind) {
        case "stand-up": {
          const res = await this.movementService.standUp(
            encounter.id,
            participantId,
            authUserId,
          );
          if (res.ok && res.events?.length) {
            await this.eventService.emit(
              encounter.sessionId,
              encounter.id,
              res.events,
            );
          }
          return {
            kind: "stand-up",
            payload: {},
            result: {
              ok: res.ok,
              summary: res.ok
                ? `Levantou-se (${res.value.movementSpent}ft de movimento)`
                : ((res as { error?: string }).error ?? "Não conseguiu levantar"),
              events: res.ok
                ? (res.events ?? []).map((event) => ({
                    type: event.event_type,
                  }))
                : [],
              error: res.ok
                ? undefined
                : {
                    code: res.code,
                    message:
                      (res as { error?: string }).error ??
                      "Não conseguiu levantar",
                  },
            },
            timestamp: ts,
          };
        }
        case "move": {
          const res = await this.movementService.moveParticipant(
            encounter.id,
            participantId,
            step.to.x,
            step.to.y,
            authUserId,
          );
          const movementEvents = res.ok ? [...(res.events ?? [])] : [];
          if (movementEvents.length > 0) {
            movementEvents.push(
              ...(await this.combatService.applyPersistentAreaDamageEvents(
                encounter.id,
                movementEvents,
                authUserId,
              )),
            );
            if (res.ok) {
              for (const ready of res.value.readyActions ?? []) {
                const resolved = await this.readyActionService.resolve({
                  encounterId: encounter.id,
                  reactorParticipantId: ready.reactorParticipantId,
                  targetParticipantId: participantId,
                  ownerUserId: authUserId,
                  expectedTriggerKind: "enemy_enters_range",
                });
                if (resolved.ok) movementEvents.push(...resolved.events);
              }
            }
            await this.eventService.emit(
              encounter.sessionId,
              encounter.id,
              movementEvents,
            );
          }
          return {
            kind: "move",
            payload: { to: step.to },
            result: {
              ok: res.ok,
              summary: res.ok
                ? `Movimento para (${step.to.x},${step.to.y})`
                : ((res as { error?: string }).error ?? "Falhou"),
              events: movementEvents.map((event) => ({
                ...event.data,
                damageType: event.data?.type,
                type: event.event_type,
                actorParticipantId: event.actor_participant_id,
                targetParticipantId: event.target_participant_id,
              })),
              error: res.ok
                ? undefined
                : {
                    code: res.code,
                    message: (res as { error?: string }).error ?? "",
                  },
            },
            timestamp: ts,
          };
        }
        case "attack": {
          const target = step.targetParticipantIds[0];
          const res = await this.combatService.resolveAttack(encounter.id, {
            attackerParticipantId: participantId,
            targetParticipantId: target,
            actionName: step.actionName,
            ownerUserId: authUserId,
            ...(isSubAttack ? { _isSubAttack: true } : {}),
          } as Parameters<typeof this.combatService.resolveAttack>[1]);





          const attackEvents: Array<{
            type: string;
            [k: string]: unknown;
          }> = [];
          if (res.ok && res.value) {
            attackEvents.push({
              type: "attack_resolved",
              actionName: step.actionName,
              attackerParticipantId: participantId,
              targetParticipantId: target,
              hit: res.value.attackRoll.hit,
              critical: res.value.attackRoll.critical,
              damageDealt: res.value.damageRoll?.finalDamage ?? 0,
              damageType: res.value.damageRoll?.type ?? null,
              targetHpBefore: res.value.targetHpBefore ?? null,
              targetDefeated: res.value.targetDefeated,
              targetHpAfter: res.value.targetHpAfter ?? null,
            });
            this.logger.info("ai.attack.resolved", {
              "attacker.participant_id": participantId,
              "target.participant_id": target,
              "attack.hit": res.value.attackRoll.hit,
              "attack.critical": res.value.attackRoll.critical,
              "damage.dealt": res.value.damageRoll?.finalDamage ?? 0,
              "target.hp_after": res.value.targetHpAfter ?? null,
              "target.defeated": res.value.targetDefeated,
            });
            const participants = await this.participantRepo.find({
              where: { encounterId: encounter.id, isDefeated: false },
            });
            const attackedParticipant = participants.find(
              (candidate) => candidate.id === target,
            );
            const readyReactors = attackedParticipant
              ? participants.filter(
                  (candidate) =>
                    candidate.faction === attackedParticipant.faction &&
                    candidate.id !== attackedParticipant.id &&
                    candidate.readiedAction?.trigger.kind ===
                      "enemy_attacks_ally" &&
                    candidate.readiedAction.trigger.allyParticipantId ===
                      attackedParticipant.id,
                )
              : [];
            for (const reactor of readyReactors) {
              const resolved = await this.readyActionService.resolve({
                encounterId: encounter.id,
                reactorParticipantId: reactor.id,
                targetParticipantId: participantId,
                ownerUserId: authUserId,
                expectedTriggerKind: "enemy_attacks_ally",
              });
              if (!resolved.ok) continue;
              await this.eventService.emit(
                encounter.sessionId,
                encounter.id,
                resolved.events,
              );
              attackEvents.push(
                ...resolved.events.map((event) => ({
                  ...event.data,
                  type: event.event_type,
                  actorParticipantId: event.actor_participant_id,
                  targetParticipantId: event.target_participant_id,
                })),
              );
            }
          } else {
            this.logger.warn("ai.attack.failed", {
              "attacker.participant_id": participantId,
              "target.participant_id": target,
              "action.name": step.actionName,
              "error.code": (res as { code?: string }).code ?? null,
              "error.message": (res as { error?: string }).error ?? null,
            });
          }
          return {
            kind: "attack",
            payload: {
              actionName: step.actionName,
              targetParticipantIds: step.targetParticipantIds,
            },
            result: {
              ok: res.ok,
              summary: res.ok
                ? `Atacou com ${step.actionName}`
                : ((res as { error?: string }).error ?? "Falhou"),
              events: attackEvents,
              error: res.ok
                ? undefined
                : {
                    code: res.code,
                    message: (res as { error?: string }).error ?? "",
                  },
            },
            timestamp: ts,
          };
        }
        case "cast-spell": {
          const res = await this.spellCastingService.castSpellInCombat({
            encounterId: encounter.id,
            participantId,
            spellSlug: step.spellSlug,
            slotLevel: step.slotLevel ?? 1,
            targetParticipantIds: step.targetParticipantIds ?? [],
            ownerUserId: authUserId,
          } as Parameters<
            typeof this.spellCastingService.castSpellInCombat
          >[0]);
          if (res.ok && res.events?.length) {
            await this.eventService.emit(
              encounter.sessionId,
              encounter.id,
              res.events,
            );
          }
          return {
            kind: "cast-spell",
            payload: { spellSlug: step.spellSlug },
            result: {
              ok: res.ok,
              summary: res.ok
                ? `Conjurou ${step.spellSlug}`
                : ((res as { error?: string }).error ?? "Falhou"),
              events: [],
              error: res.ok
                ? undefined
                : {
                    code: res.code,
                    message: (res as { error?: string }).error ?? "",
                  },
            },
            timestamp: ts,
          };
        }
        case "dodge":
        case "dash":
        case "disengage":
        case "help":
        case "hide":
        case "ready":
        case "search":
        case "use-object":
        case "escape-web":
        case "freedom-escape":
        case "flee-fear":
        case "wake-hypnotized": {
          const dto = toGenericActionDto(participantId, step);
          const res = await this.genericActionsService.execute(
            encounter.id,
            dto,
          );
          if (res.ok && res.events?.length) {
            await this.eventService.emit(
              encounter.sessionId,
              encounter.id,
              res.events,
            );
          }
          return res.ok
            ? { ...res.value.step, timestamp: ts }
            : {
                kind: step.kind,
                payload: dto as unknown as Record<string, unknown>,
                result: {
                  ok: false,
                  summary: (res as { error?: string }).error ?? "Falhou",
                  events: [],
                  error: {
                    code: res.code,
                    message: (res as { error?: string }).error ?? "",
                  },
                },
                timestamp: ts,
              };
        }
        case "end-turn": {
          const res = await this.combatService.endTurn(encounter.id);
          return {
            kind: "end-turn",
            payload: {},
            result: {
              ok: res.ok,
              summary: "Turno encerrado",
              events: [{ type: "turn_ended", participantId }],
              error: res.ok
                ? undefined
                : {
                    code: res.code,
                    message: (res as { error?: string }).error ?? "",
                  },
            },
            timestamp: ts,
          };
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        kind: step.kind,
        payload: step as unknown as Record<string, unknown>,
        result: {
          ok: false,
          summary: `Erro: ${msg}`,
          events: [],
          error: { code: "INTERNAL", message: msg },
        },
        timestamp: ts,
      };
    }
  }

  private async fallbackEndTurn(
    encounter: EncounterEntity,
    participant: EncounterParticipantEntity,
    start: number,
    reason: string,
  ): Promise<GameResult<TurnExecutionResult>> {
    const endResult = await this.combatService.endTurn(encounter.id);
    const result: TurnExecutionResult = {
      steps: [
        {
          kind: "end-turn",
          payload: { reason },
          result: {
            ok: true,
            summary: `Turno encerrado por ${reason}`,
            events: [
              { type: reason, participantId: participant.id },
              { type: "turn_ended", participantId: participant.id },
            ],
          },
          timestamp: new Date().toISOString(),
        },
      ],
      finalState: {
        actionUsed: participant.actionUsed,
        bonusUsed: participant.bonusActionUsed,
        movementRemaining: participant.movementRemaining ?? 0,
        reactionUsed: participant.reactionsUsed > 0,
        hp: {
          current: participant.currentHp ?? 0,
          max: participant.maxHp ?? 0,
        },
        conditions: participant.conditions ?? [],
        dyingState: participant.dyingState,
      },
      tookMs: Date.now() - start,
      rationale: `Fallback: ${reason}`,
    };
    return success(result);
  }
}

function toGenericActionDto(
  participantId: string,
  step: PlannedActionStep,
): GenericActionDto {
  const asBonus =
    (step as PlannedActionStep & { asBonusAction?: boolean }).asBonusAction ===
    true;
  switch (step.kind) {
    case "dodge":
    case "dash":
    case "disengage":
    case "hide":
      return {
        kind: step.kind,
        participantId,
        asBonusAction: asBonus,
      } as GenericActionDto;
    case "help":
      return {
        kind: "help",
        participantId,
        allyParticipantId: step.allyParticipantId,
        targetParticipantId: step.targetParticipantId,
      } as GenericActionDto;
    case "ready":
      return {
        kind: "ready",
        participantId,
        trigger: step.trigger,
        readiedAction:
          step.readiedAction.kind === "attack"
            ? {
                kind: "attack",
                actionName:
                  (step.readiedAction as { actionName?: string }).actionName ??
                  "",
              }
            : {
                kind: "move",
                to: (step.readiedAction as { to?: { x: number; y: number } })
                  .to ?? { x: 0, y: 0 },
              },
      } as unknown as GenericActionDto;
    case "search":
      return {
        kind: "search",
        participantId,
        ability: step.ability,
        searchSense: step.searchSense,
      } as GenericActionDto;
    case "use-object":
      return {
        kind: "use-object",
        participantId,
        objectRef: step.objectRef,
      } as GenericActionDto;
    case "escape-web":
      return {
        kind: "escape-web",
        participantId,
      } as GenericActionDto;
    case "freedom-escape":
      return {
        kind: "freedom-escape",
        participantId,
      } as GenericActionDto;
    case "flee-fear":
      return {
        kind: "flee-fear",
        participantId,
      } as GenericActionDto;
    case "wake-hypnotized":
      return {
        kind: "wake-hypnotized",
        participantId,
        targetParticipantId: step.targetParticipantId,
      } as GenericActionDto;
    default:
      throw new Error(`Step inesperado para DTO genérico: ${step.kind}`);
  }
}
