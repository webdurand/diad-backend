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

      steps.push({ kind: "end-turn" });
      rationale = "Nenhum inimigo visível; turno passa.";
    } else {
      const nearest = pickNearest(self, enemies, snapshot);

      const dist =
        snapshot.map && self.position ? distanceFt(self, nearest) : 0;
      if (
        snapshot.map &&
        dist > 5 &&
        self.actionEconomy.movementRemaining > 0
      ) {

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

  void snapshot;
  return sorted[0];
}
