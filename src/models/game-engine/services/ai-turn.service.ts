import { Injectable, Logger } from "@nestjs/common";
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
  private readonly logger = new Logger(AiTurnService.name);

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
  ) {}

  async executeAiTurn(
    encounterId: string,
    participantId: string,
    authUserId: string,
  ): Promise<GameResult<TurnExecutionResult>> {
    const start = Date.now();

    this.logger.log(
      `[AI-TURN-START] encounter=${encounterId} participant=${participantId}`,
    );

    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) {
      this.logger.warn(
        `[AI-TURN-FAIL] encounter_not_found encounter=${encounterId}`,
      );
      return failure(GameErrorCode.ENCOUNTER_NOT_FOUND);
    }
    if (encounter.status !== "active") {
      this.logger.warn(
        `[AI-TURN-FAIL] encounter_not_active encounter=${encounterId} status=${encounter.status}`,
      );
      return failure(GameErrorCode.ENCOUNTER_NOT_ACTIVE);
    }

    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant) {
      this.logger.warn(
        `[AI-TURN-FAIL] participant_not_found participant=${participantId}`,
      );
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
      const cachedSteps = (
        (participant.lastAiTurnResult as { steps?: Array<{ kind?: string }> })
          .steps ?? []
      );
      const hasUsefulStep = cachedSteps.some(
        (s) =>
          s.kind === "attack" ||
          s.kind === "move" ||
          s.kind === "cast-spell" ||
          s.kind === "use-object" ||
          s.kind === "help",
      );
      if (hasUsefulStep) {
        this.logger.log(
          `[AI-TURN-CACHE] hit participant=${participantId} round=${encounter.currentRound} steps=${JSON.stringify(cachedSteps)}`,
        );
        return success(participant.lastAiTurnResult);
      }
      this.logger.log(
        `[AI-TURN-CACHE] discard stale participant=${participantId} round=${encounter.currentRound} steps=${JSON.stringify(cachedSteps)} (degenerado, recomputando)`,
      );
    }

    if (participant.controlledBy !== "ai") {
      this.logger.warn(
        `[AI-TURN-FAIL] not_ai_controlled participant=${participantId} ` +
          `controlledBy=${participant.controlledBy}`,
      );
      return failure(GameErrorCode.NOT_AI_CONTROLLED);
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== participant.id) {
      this.logger.warn(
        `[AI-TURN-FAIL] not_your_turn participant=${participantId} ` +
          `currentTurnIndex=${encounter.currentTurnIndex} ` +
          `turnOrder[idx]=${encounter.turnOrder[encounter.currentTurnIndex]}`,
      );
      return failure(GameErrorCode.NOT_YOUR_TURN);
    }

    // Build snapshot
    const snapRes = await this.snapshotService.build(encounterId, authUserId);
    if (!snapRes.ok) {
      this.logger.warn(
        `[AI-TURN-FAIL] snapshot_build_failed encounter=${encounterId} code=${snapRes.code}`,
      );
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
    this.logger.log(
      `[AI-TURN-SNAPSHOT] encounter=${encounterId} ` +
        `round=${encounter.currentRound} turnIdx=${encounter.currentTurnIndex} ` +
        `participants=${snapRes.value.participants.length} ` +
        `monster="${monsterPart?.displayName ?? "?"}" ` +
        `pos=(${monsterPart?.position?.x},${monsterPart?.position?.y}) ` +
        `hp=${monsterPart?.hp?.current}/${monsterPart?.hp?.max} ` +
        `faction=${monsterPart?.faction} ` +
        `actionsCount=${monsterPart?.statblockRef?.actions?.length ?? 0} ` +
        `enemiesAlive=${enemiesAlive.length}`,
    );
    // Spec 027 (M2 follow-up logs) — breakdown completo dos participantes.
    // Crítico quando enemiesAlive=0: revela se PC está dying, faction errada
    // do witness propagation, ou encontro stuck que deveria ter resolvido.
    const breakdown = snapRes.value.participants
      .map(
        (p) =>
          `${p.id.slice(0, 8)}/"${p.displayName}"/` +
          `${p.type}/${p.faction}/` +
          `hp=${p.hp?.current}/${p.hp?.max}/` +
          `dying=${p.dyingState}/` +
          `pos=(${p.position?.x},${p.position?.y})`,
      )
      .join(" | ");
    this.logger.log(`[AI-TURN-PARTICIPANTS] ${breakdown}`);

    // Chama executor
    const planRes = await this.executor.executeTurn(
      snapRes.value,
      participantId,
    );
    if (!planRes.ok) {
      this.logger.warn(
        `[AI-TURN-FAIL] executor_failed encounter=${encounterId} ` +
          `participant=${participantId} code=${planRes.code}`,
      );
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
    this.logger.log(
      `[AI-TURN] participant=${participantId} round=${encounter.currentRound} steps=${JSON.stringify(planRes.value.steps)}`,
    );
    const executedSteps: ActionStep[] = [];
    for (const step of planRes.value.steps) {
      const executed = await this.applyStep(
        encounter,
        participantId,
        step,
        authUserId,
      );
      executedSteps.push(executed);
      this.logger.log(
        `[AI-TURN] step.kind=${step.kind} ok=${executed.result.ok} summary="${executed.result.summary}" error=${executed.result.error?.code ?? "-"}`,
      );
      // Se step falhou criticamente (ex: TARGET_DEFEATED), para — o
      // frontend/executor pode re-chamar com continuationFrom.
      if (!executed.result.ok && step.kind !== "end-turn") {
        this.logger.warn(
          `Step ${step.kind} falhou: ${executed.result.error?.code} — ${executed.result.summary}`,
        );
        break;
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
          } as Parameters<typeof this.combatService.resolveAttack>[1]);
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
  switch (step.kind) {
    case "dodge":
    case "dash":
    case "disengage":
    case "hide":
      return { kind: step.kind, participantId } as GenericActionDto;
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
