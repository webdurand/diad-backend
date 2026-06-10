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
import { SceneContextCacheService } from "src/models/session/services/scene-context-cache.service";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { EventAudience } from "src/common/event-bus/event-envelope.types";

const LOCATION_VISIT_AUDIENCES: EventAudience[] = [
  "Narrator",
  "Director",
  "HUD",
];

// Spec 053: viagem deixa de ser clicker — cada tick pode rolar um evento.
// threatLevel 'alto' → overlay de encounter no front; 'baixo' → banner ambient.
export interface TravelTickEvent {
  kind: "ambient" | "hostile";
  threatLevel: "baixo" | "medio" | "alto";
  descriptor: string;
}

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
      travelEvent?: TravelTickEvent | null;
    }
  | {
      status: "ready_to_arrive";
      travelState: SessionTravelState;
      progressPercent: 100;
    };

export type TravelArriveResult =
  | { status: "no_travel" }
  | {
      status: "arrived";
      sceneId: string;
      toLocationId: string;
      toLocationName: string;
      fromLocationId: string | null;
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
    private readonly contextCache: SceneContextCacheService,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(TravelTickService.name);
  }

  private async invalidateActiveSceneCache(sessionId: string): Promise<void> {
    const active = await this.sceneService.getActive(sessionId);
    if (active?.id) this.contextCache.invalidate(active.id);
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

    if (travel.elapsedTurns >= travel.totalTurns) {
      this.logger.info("🚶 travel.tick already_ready_to_arrive", {
        "session.id": sessionId,
        "travel.total": travel.totalTurns,
      });
      return {
        status: "ready_to_arrive",
        travelState: travel,
        progressPercent: 100,
      };
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

    const travelEvent = this.rollTravelEvent(travel);

    session.travelState = travel;
    await this.sessionRepo.save(session);
    await this.invalidateActiveSceneCache(sessionId);

    const progressPercent = Math.round(
      (travel.elapsedTurns / travel.totalTurns) * 100,
    );
    const justReachedDestination = travel.elapsedTurns >= travel.totalTurns;

    this.logger.info("🚶 travel.tick", {
      "session.id": sessionId,
      "travel.elapsed": travel.elapsedTurns,
      "travel.total": travel.totalTurns,
      "travel.progress": progressPercent,
      "travel.destination_biome": travel.destinationBiome,
      "travel.ready_to_arrive": justReachedDestination,
      "travel.event": travelEvent?.kind ?? "none",
    });

    if (justReachedDestination) {
      return {
        status: "ready_to_arrive",
        travelState: travel,
        progressPercent: 100,
      };
    }

    return {
      status: "in_transit",
      travelState: travel,
      progressPercent,
      travelEvent,
    };
  }

  // Spec 053: rolagem de evento por tick. Chance base por bioma + delta de
  // scout falho (encounterRollDeltaNextTurn, escrito pelo travel-action e
  // consumido aqui exatamente uma vez). Determinístico via Math.random local
  // — sem LLM; a prosa do evento é responsabilidade do Narrator no próximo turno.
  private rollTravelEvent(
    travel: SessionTravelState & { encounterRollDeltaNextTurn?: number },
  ): TravelTickEvent | null {
    const biome = (travel.destinationBiome ?? "road").toLowerCase();
    const baseChance: Record<string, number> = {
      road: 2,
      urban: 1,
      settlement: 1,
      city: 1,
      wilderness: 4,
      forest: 4,
      mountain: 5,
      mountains: 5,
      desert: 5,
      swamp: 6,
      planar: 7,
      supernatural: 7,
    };
    const delta = Math.max(0, travel.encounterRollDeltaNextTurn ?? 0);
    if (delta > 0) travel.encounterRollDeltaNextTurn = 0;
    const threshold = (baseChance[biome] ?? 3) + delta * 3;
    const roll = Math.floor(Math.random() * 20) + 1;
    if (roll > threshold) return null;

    const hostile = Math.random() < 0.35;
    const dangerous = (baseChance[biome] ?? 3) >= 5;
    const descriptorTable: Record<"ambient" | "hostile", string[]> = {
      ambient: [
        "Um mercador solitário acena da beira do caminho.",
        "Rastros recentes cruzam a trilha — grandes demais para serem de cervo.",
        "Uma fogueira abandonada ainda solta fumaça fina.",
        "Um viajante encapuzado observa o grupo passar, sem dizer palavra.",
      ],
      hostile: [
        "Vultos se movem em paralelo à trilha, cercando devagar.",
        "Um assobio curto corta o ar — sinal de emboscada.",
        "O cheiro de carniça fica forte demais para ser coincidência.",
      ],
    };
    const kind: "ambient" | "hostile" = hostile ? "hostile" : "ambient";
    const options = descriptorTable[kind];
    const descriptor = options[Math.floor(Math.random() * options.length)];
    return {
      kind,
      threatLevel: hostile ? (dangerous ? "alto" : "medio") : "baixo",
      descriptor,
    };
  }

  async arrive(sessionId: string): Promise<TravelArriveResult> {
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

    const fromLocationId = travel.fromLocationId;
    const toLocationId = travel.toLocationId;
    const toLocationName = travel.toLocationName;

    session.travelState = null;
    await this.sessionRepo.save(session);
    await this.invalidateActiveSceneCache(sessionId);

    const newScene = await this.sceneService.create(sessionId, {
      locationId: toLocationId,
      title: toLocationName,
      reason: "travel_arrival",
      skipBudgetIncrement: true,
    });
    const destination = await this.locationService.getById(toLocationId);
    await this.locationService.markVisited(toLocationId);
    await this.publishLocationVisited({
      session,
      sceneId: newScene.id,
      fromLocationId,
      locationId: toLocationId,
      locationName: toLocationName,
      locationSlug: destination.slug,
    });
    await this.invalidateActiveSceneCache(sessionId);

    this.logger.info("🚶 travel.arrive", {
      "session.id": sessionId,
      "scene.id": newScene.id,
      "location.from": fromLocationId ?? "(none)",
      "location.to": toLocationId,
      "location.name": toLocationName,
    });

    return {
      status: "arrived",
      sceneId: newScene.id,
      toLocationId,
      toLocationName,
      fromLocationId,
    };
  }

  private async publishLocationVisited(params: {
    session: GameSessionEntity;
    sceneId: string;
    fromLocationId: string | null;
    locationId: string;
    locationName: string;
    locationSlug?: string | null;
  }): Promise<void> {
    if (!params.session.campaignId) return;
    const envelope = this.envelopeFactory.build({
      eventCategory: "WorldEvent",
      eventType: "location_visited",
      source: {
        service: "diad-backend",
        module: "TravelTickService.arrive",
      },
      scope: {
        campaignId: params.session.campaignId,
        sessionId: params.session.id,
        sceneId: params.sceneId,
      },
      payload: {
        sessionId: params.session.id,
        fromLocationId: params.fromLocationId,
        locationId: params.locationId,
        locationName: params.locationName,
        locationSlug: params.locationSlug ?? null,
      },
      audiences: LOCATION_VISIT_AUDIENCES,
      narrativeDescriptor: `Local visitado: ${params.locationName}`,
    });
    try {
      await this.eventBus.publish(envelope);
    } catch (err) {
      this.logger.warn("travel.arrive.location_visited_publish_failed", {
        "session.id": params.session.id,
        "location.id": params.locationId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
