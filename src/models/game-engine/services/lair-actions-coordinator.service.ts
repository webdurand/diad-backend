import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { EncounterEntity } from "src/entities/encounter.entity";
import { LairActionService } from "./lair-action.service";
import { EncounterSnapshotService } from "./encounter-snapshot.service";
import { AiProxyService } from "src/models/ai-proxy/ai-proxy.service";
import type { GameEventData } from "../interfaces/result.type";

@Injectable()
export class LairActionsCoordinator {
  private readonly logger = new Logger(LairActionsCoordinator.name);

  constructor(
    private readonly lairService: LairActionService,
    private readonly snapshotService: EncounterSnapshotService,
    @Inject(forwardRef(() => AiProxyService))
    private readonly aiProxy: AiProxyService,
  ) {}

  async processRoundStart(
    encounter: EncounterEntity,
  ): Promise<GameEventData[]> {
    const events: GameEventData[] = [];
    if (!encounter.inLair) return events;

    const available = await this.lairService.availableForRound(encounter);
    if (available.length === 0) return events;

    let snapshot: unknown = null;
    try {
      const snapshotRes = await this.snapshotService.build(
        encounter.id,
        "system",
        null,
      );
      if (snapshotRes.ok) snapshot = snapshotRes.value;
    } catch (err) {
      this.logger.warn(`lair.snapshot_failed: ${(err as Error).message}`);
      return events;
    }

    for (const entry of available) {
      try {
        const decision = await this.aiProxy.decideLair({
          snapshot,
          monsterParticipantId: entry.participantId,
        });
        if (
          decision.actionIndex === null ||
          decision.actionIndex === undefined
        ) {
          continue;
        }
        const exec = await this.lairService.execute(
          encounter,
          entry.participantId,
          decision.actionIndex,
        );
        if (exec.ok && exec.events) {
          events.push(...exec.events);
        }
      } catch (err) {
        this.logger.warn(
          `lair.process_failed monsterId=${entry.participantId}: ${(err as Error).message}`,
        );
      }
    }

    return events;
  }
}
