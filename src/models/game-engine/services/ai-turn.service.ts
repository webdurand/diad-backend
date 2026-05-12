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
import type { GenericActionDto } from "../dto/generic-action.dto";

/**
 * Spec 003 T050 — orquestrador de `POST /encounters/:id/ai-turn`.
 *
 * Fluxo:
 *  1. Idempotência via `lastAiTurnRound === currentRound`.
 *  2. Valida pré-requisitos (controlledBy='ai', turno, encounter ativo).
 *  3. Build snapshot.
 *  4. Chama `AiTurnExecutor.executeTurn` (timeout 30s, catch → fallback).
 *  5. Aplica cada step via serviços existentes (combat.resolveAttack,
 *     movement.move, genericActions.execute, etc.).
 *  6. Persiste resultado + emite evento `ai_turn_executed`.
 */
@Injectable()
export class AiTurnService {
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
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(AiTurnService.name);
  }

  async executeAiTurn(
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

    // Idempotência: mesmo round + resultado cacheado → retorna direto.
    // Spec 027 (M2 follow-up) — invalida cache quando steps são triviais (só
    // dodge/end-turn, sem attack/move/cast). Cobre regressão onde upgrade do
    // engine de decisão (ex: smart→medium fallback) não dispararia em rounds
    // antigos que cacheraram steps degenerados.
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

    // Build snapshot
    const snapRes = await this.snapshotService.build(encounterId, authUserId);
    if (!snapRes.ok) {
      this.logger.warn("ai.turn.fail", {
        "fail.reason": "snapshot_build_failed",
        "encounter.id": encounterId,
        "error.code": snapRes.code,
      });
      return snapRes;
    }

    // Spec 027 (M2 follow-up logs) — summary do que sai pro agents service.
    // Foco: diagnose silent fail "NPC parado". Loga monster + position +
    // actions count (se 0 → snapshot não propagou statblockRef.actions e
    // _pick_best_attack vai cair pra Unarmed Strike).
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
    // Breakdown dos participantes — útil pra entender encontros stuck.
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

    // Chama executor
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

    // Aplica steps
    this.logger.info("ai.turn.steps_planned", {
      "participant.id": participantId,
      "encounter.round": encounter.currentRound,
      "steps.count": planRes.value.steps.length,
      steps: planRes.value.steps,
    });
    const executedSteps: ActionStep[] = [];
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
      // Se step falhou criticamente (ex: TARGET_DEFEATED), para — o
      // frontend/executor pode re-chamar com continuationFrom.
      if (!executed.result.ok && step.kind !== "end-turn") {
        this.logger.warn("ai.turn.step_failed", {
          "step.kind": step.kind,
          "step.error.code": executed.result.error?.code,
          "step.summary": executed.result.summary,
        });
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
    }

    // Garante end-turn
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

    // Cache pra idempotência
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
        case "move": {
          const res = await this.movementService.moveParticipant(
            encounter.id,
            participantId,
            step.to.x,
            step.to.y,
            authUserId,
          );
          return {
            kind: "move",
            payload: { to: step.to },
            result: {
              ok: res.ok,
              summary: res.ok
                ? `Movimento para (${step.to.x},${step.to.y})`
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
        case "attack": {
          const target = step.targetParticipantIds[0];
          const res = await this.combatService.resolveAttack(encounter.id, {
            attackerParticipantId: participantId,
            targetParticipantId: target,
            actionName: step.actionName,
            ownerUserId: authUserId,
            ...(isSubAttack ? { _isSubAttack: true } : {}),
          } as Parameters<typeof this.combatService.resolveAttack>[1]);
          // Spec 027 (M2 follow-up) — propaga AttackResult no events array.
          // Antes events ficava `[]` e o frontend não tinha como animar
          // damage floater no ataque da IA — PC tomava dano sem feedback
          // visual. Frontend (page.tsx) lê `attack_resolved` e chama
          // showDamageFloater pra render o número flutuante no token.
          const attackEvents: Array<{
            type: string;
            [k: string]: unknown;
          }> = [];
          if (res.ok && res.value) {
            attackEvents.push({
              type: "attack_resolved",
              attackerParticipantId: participantId,
              targetParticipantId: target,
              hit: res.value.attackRoll.hit,
              critical: res.value.attackRoll.critical,
              damageDealt: res.value.damageRoll?.finalDamage ?? 0,
              damageType: res.value.damageRoll?.type ?? null,
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
        case "use-object": {
          const dto = toGenericActionDto(participantId, step);
          const res = await this.genericActionsService.execute(
            encounter.id,
            dto,
          );
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
    await this.combatService.endTurn(encounter.id);
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
      } as GenericActionDto;
    case "use-object":
      return {
        kind: "use-object",
        participantId,
        objectRef: step.objectRef,
      } as GenericActionDto;
    default:
      throw new Error(`Step inesperado para DTO genérico: ${step.kind}`);
  }
}
