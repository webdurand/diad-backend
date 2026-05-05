import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  GameSessionEntity,
  SessionTravelState,
} from "src/entities/game-session.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { LocationService } from "src/models/world/services/location.service";
import { GameClockService } from "src/models/world/services/game-clock.service";
import { SceneService } from "src/models/session/services/scene.service";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";

export type TravelTickResult =
  | { status: "no_travel" }
  | {
      status: "paused_combat";
      travelState: SessionTravelState;
      progressPercent: number;
    }
  | {
      status: "in_transit";
      travelState: SessionTravelState;
      progressPercent: number;
    }
  | {
      status: "arrived";
      sceneId: string;
      toLocationId: string;
      toLocationName: string;
      progressPercent: 100;
    };

@Injectable()
export class TravelTickService {
  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    private readonly sceneService: SceneService,
    private readonly locationService: LocationService,
    private readonly gameClockService: GameClockService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(TravelTickService.name);
  }

  async tick(sessionId: string): Promise<TravelTickResult> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new DomainException(
        ErrorCode.SESSION_NOT_FOUND,
        `Sessão ${sessionId} não encontrada.`,
      );
    }

    const travel = session.travelState;
    if (!travel?.active) {
      return { status: "no_travel" };
    }

    if (session.activeEncounterId) {
      const encounter = await this.encounterRepo.findOne({
        where: { id: session.activeEncounterId },
        select: ["id", "status"],
      });
      if (encounter && encounter.status === "active") {
        const progressPercent = Math.round(
          (travel.elapsedTurns / travel.totalTurns) * 100,
        );
        this.logger.info("🚶 travel.tick paused", {
          "session.id": sessionId,
          "travel.elapsed": travel.elapsedTurns,
          "travel.total": travel.totalTurns,
          "encounter.id": encounter.id,
        });
        return {
          status: "paused_combat",
          travelState: travel,
          progressPercent,
        };
      }
    }

    travel.elapsedTurns += 1;
    travel.elapsedMinutes += travel.minutesPerTurn;

    if (session.campaignId && travel.minutesPerTurn > 0) {
      try {
        await this.gameClockService.advanceTime(session.campaignId, {
          hours: travel.minutesPerTurn / 60,
          trigger: "travel_tick",
        });
      } catch (err) {
        this.logger.warn("travel.tick clock_skip", {
          "session.id": sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const arrived = travel.elapsedTurns >= travel.totalTurns;

    if (arrived) {
      session.travelState = null;
      await this.sessionRepo.save(session);

      const newScene = await this.sceneService.create(sessionId, {
        locationId: travel.toLocationId,
        title: travel.toLocationName,
        reason: "travel_arrival",
      });
      await this.locationService.markVisited(travel.toLocationId);

      this.logger.info("🚶 travel.arrived", {
        "session.id": sessionId,
        "scene.id": newScene.id,
        "location.to": travel.toLocationId,
        "location.name": travel.toLocationName,
        "travel.turns": travel.totalTurns,
      });

      return {
        status: "arrived",
        sceneId: newScene.id,
        toLocationId: travel.toLocationId,
        toLocationName: travel.toLocationName,
        progressPercent: 100,
      };
    }

    session.travelState = travel;
    await this.sessionRepo.save(session);

    const progressPercent = Math.round(
      (travel.elapsedTurns / travel.totalTurns) * 100,
    );

    this.logger.info("🚶 travel.tick", {
      "session.id": sessionId,
      "travel.elapsed": travel.elapsedTurns,
      "travel.total": travel.totalTurns,
      "travel.progress": progressPercent,
      "travel.destination_biome": travel.destinationBiome,
    });

    return {
      status: "in_transit",
      travelState: travel,
      progressPercent,
    };
  }
}
