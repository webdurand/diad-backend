import { Injectable } from "@nestjs/common";
import {
  AiTurnExecutor,
  TurnExecutionPlan,
  AiTurnExecutorOpts,
} from "./ai-turn-executor.interface";
import {
  success,
  GameResult,
  failure,
  GameErrorCode,
} from "../interfaces/result.type";
import type {
  EncounterSnapshot,
  SnapshotParticipant,
} from "../interfaces/encounter-snapshot.interface";
import type { PlannedActionStep } from "../interfaces/combat.interfaces";

/**
 * Spec 003 T045 — implementação determinística do `AiTurnExecutor` usada em
 * testes (NODE_ENV=test) e como stub quando `diad-agents` não está UP.
 *
 * Heurística mínima RAW-safe: escolhe o inimigo mais próximo visível, move
 * adjacente se possível, ataca com a primeira ação que tem `attackBonus`,
 * encerra o turno. Suficiente para validar o pipeline `/ai-turn` sem LLM.
 */
@Injectable()
export class MockAiTurnExecutor extends AiTurnExecutor {
  async executeTurn(
    snapshot: EncounterSnapshot,
    participantId: string,
    _opts?: AiTurnExecutorOpts,
  ): Promise<GameResult<TurnExecutionPlan>> {
    const start = Date.now();
    const self = snapshot.participants.find((p) => p.id === participantId);
    if (!self) return failure(GameErrorCode.PARTICIPANT_NOT_FOUND);

    const enemies = snapshot.participants.filter(
      (p) =>
        p.faction !== self.faction &&
        p.hp.current > 0 &&
        p.dyingState !== "dead",
    );

    const steps: PlannedActionStep[] = [];
    let rationale = "";

    if (enemies.length === 0) {
      // Nenhum inimigo — apenas encerra o turno.
      steps.push({ kind: "end-turn" });
      rationale = "Nenhum inimigo visível; turno passa.";
    } else {
      const nearest = pickNearest(self, enemies, snapshot);
      // Move adjacente se mapa presente e distância > 1 tile
      const dist =
        snapshot.map && self.position ? distanceFt(self, nearest) : 0;
      if (
        snapshot.map &&
        dist > 5 &&
        self.actionEconomy.movementRemaining > 0
      ) {
        // Simples heurística: move em direção ao alvo (1 step × movementRemaining)
        steps.push({
          kind: "move",
          to: {
            x:
              self.position.x + Math.sign(nearest.position.x - self.position.x),
            y:
              self.position.y + Math.sign(nearest.position.y - self.position.y),
          },
        });
      }

      // Escolhe a ação com maior attackBonus
      const attackAction = [...self.availableActions]
        .filter((a) => typeof a.attackBonus === "number")
        .sort((a, b) => (b.attackBonus ?? 0) - (a.attackBonus ?? 0))[0];

      if (attackAction) {
        steps.push({
          kind: "attack",
          actionName: attackAction.name,
          targetParticipantIds: [nearest.id],
        });
        rationale = `Atacou ${nearest.displayName} com ${attackAction.name} (alvo mais próximo).`;
      } else {
        // Fallback: esquiva
        steps.push({ kind: "dodge" });
        rationale = "Sem ataque disponível — esquivou.";
      }

      steps.push({ kind: "end-turn" });
    }

    return success({
      steps,
      rationale,
      tookMs: Date.now() - start,
      llmCostUsd: 0,
    });
  }
}

function distanceFt(a: SnapshotParticipant, b: SnapshotParticipant): number {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  return Math.ceil(Math.sqrt(dx * dx + dy * dy)) * 5;
}

function pickNearest(
  self: SnapshotParticipant,
  enemies: SnapshotParticipant[],
  snapshot: EncounterSnapshot,
): SnapshotParticipant {
  // Usa `self.distances` se preenchido pelo EncounterSnapshotService; senão
  // calcula pelo position.
  if (self.distances && Object.keys(self.distances).length > 0) {
    const sorted = [...enemies].sort(
      (a, b) =>
        (self.distances[a.id] ?? Infinity) - (self.distances[b.id] ?? Infinity),
    );
    return sorted[0];
  }
  const sorted = [...enemies].sort(
    (a, b) => distanceFt(self, a) - distanceFt(self, b),
  );
  // Suprime warning de `snapshot` não-usado
  void snapshot;
  return sorted[0];
}
