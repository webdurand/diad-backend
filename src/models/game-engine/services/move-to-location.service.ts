import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  GameSessionEntity,
  SessionTravelState,
} from "src/entities/game-session.entity";
import { LocationConnectionEntity } from "src/entities/location-connection.entity";
import { LocationEntity } from "src/entities/location.entity";
import { LocationService } from "src/models/world/services/location.service";
import { SceneService } from "src/models/session/services/scene.service";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { parseTravelTimeToMinutes } from "src/lib/parse-travel-time";
import {
  computeTravelTurns,
  TRAVEL_DEFAULT_MINUTES_FALLBACK,
} from "src/lib/travel-turn-bucket";

export interface MoveToLocationInput {
  sessionId: string;
  targetLocationId?: string;
  targetLocationName?: string;
  reason?: string;
}

export type MoveToLocationResult =
  | {
      travelMode: "already_there";
      sceneId: string;
      fromLocationId: string | null;
      toLocationId: string;
      toLocationName: string;
    }
  | {
      travelMode: "in_transit";
      fromLocationId: string | null;
      toLocationId: string;
      toLocationName: string;
      travelTime: string | null;
      travelState: SessionTravelState;
    };

export interface AvailableTravel {
  connectionId: string;
  toLocationId: string;
  toLocationName: string;
  toLocationType: string;
  travelTime: string | null;
  description: string | null;
  isLocked: boolean;
  requirements: Record<string, any>;
}

const OUTDOOR_TYPES = new Set(["wilderness", "dungeon", "dungeon_room"]);

function deriveDestinationBiome(toLocationType: string): string {
  if (OUTDOOR_TYPES.has(toLocationType)) return toLocationType;
  return "road";
}

@Injectable()
export class MoveToLocationService {
  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(LocationConnectionEntity)
    private readonly connectionRepo: Repository<LocationConnectionEntity>,
    private readonly locationService: LocationService,
    private readonly sceneService: SceneService,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(MoveToLocationService.name);
  }

  async run(input: MoveToLocationInput): Promise<MoveToLocationResult> {
    if (!input.targetLocationId && !input.targetLocationName) {
      throw new DomainException(
        ErrorCode.VALIDATION_INVALID_PAYLOAD,
        "Necessário targetLocationId ou targetLocationName.",
      );
    }

    const session = await this.sessionRepo.findOne({
      where: { id: input.sessionId },
    });
    if (!session) {
      throw new DomainException(
        ErrorCode.SESSION_NOT_FOUND,
        `Sessão ${input.sessionId} não encontrada.`,
      );
    }
    if (!session.campaignId) {
      throw new DomainException(
        ErrorCode.LOCATION_NOT_FOUND,
        "Sessão sem campanha vinculada — movimento não disponível.",
      );
    }

    if (session.travelState?.active) {
      throw new DomainException(
        ErrorCode.VALIDATION_INVALID_PAYLOAD,
        "Já existe viagem em andamento — aguarde chegada para iniciar nova.",
        {
          context: {
            sessionId: session.id,
            currentDestination: session.travelState.toLocationName,
          },
        },
      );
    }

    const target = await this.resolveTarget(session.campaignId, input);

    const currentScene = await this.sceneService.getActive(input.sessionId);
    const fromLocationId = currentScene?.locationId ?? null;

    if (fromLocationId === target.id) {
      return {
        travelMode: "already_there",
        sceneId: currentScene!.id,
        fromLocationId,
        toLocationId: target.id,
        toLocationName: target.name,
      };
    }

    let connection: LocationConnectionEntity | null = null;
    let travelTime: string | null = null;
    if (fromLocationId) {
      connection = await this.connectionRepo.findOne({
        where: { fromLocationId, toLocationId: target.id },
      });
      if (!connection) {
        throw new DomainException(
          ErrorCode.LOCATION_CONNECTION_BLOCKED,
          `Não há rota direta entre as locations.`,
          {
            context: { fromLocationId, toLocationId: target.id },
            hint: "Director deve narrar obstáculo ou revelar caminho via reveal_connection (V2).",
          },
        );
      }
      if (connection.isLocked) {
        throw new DomainException(
          ErrorCode.LOCATION_REQUIREMENTS_NOT_MET,
          `Conexão bloqueada — requirements não atendidos.`,
          {
            context: {
              fromLocationId,
              toLocationId: target.id,
              requirements: connection.requirements,
            },
            hint: "Director narra obstáculo (porta trancada, ponte caída, etc).",
          },
        );
      }
      travelTime = connection.travelTime ?? null;
    }

    const parsedMinutes = parseTravelTimeToMinutes(travelTime);
    const totalMinutes =
      parsedMinutes && parsedMinutes > 0
        ? parsedMinutes
        : TRAVEL_DEFAULT_MINUTES_FALLBACK;
    const totalTurns = computeTravelTurns(totalMinutes);

    return this.runInTransit({
      session,
      target,
      fromLocationId,
      connection,
      travelTime,
      totalMinutes,
      totalTurns,
      reason: input.reason ?? "player_movement",
    });
  }

  async listAvailableTravels(sessionId: string): Promise<AvailableTravel[]> {
    const scene = await this.sceneService.getActive(sessionId);
    if (!scene?.locationId) return [];

    const connections = await this.connectionRepo.find({
      where: { fromLocationId: scene.locationId, isHidden: false },
      relations: ["toLocation"],
    });

    return connections.map((c) => ({
      connectionId: c.id,
      toLocationId: c.toLocationId,
      toLocationName: c.toLocation?.name ?? "(?)",
      toLocationType: c.toLocation?.type ?? "unknown",
      travelTime: c.travelTime ?? null,
      description: c.description ?? null,
      isLocked: c.isLocked,
      requirements: c.requirements ?? {},
    }));
  }

  private async runInTransit(params: {
    session: GameSessionEntity;
    target: LocationEntity;
    fromLocationId: string | null;
    connection: LocationConnectionEntity | null;
    travelTime: string | null;
    totalMinutes: number;
    totalTurns: number;
    reason: string;
  }): Promise<MoveToLocationResult> {
    const {
      session,
      target,
      fromLocationId,
      connection,
      travelTime,
      totalMinutes,
      totalTurns,
      reason,
    } = params;

    const minutesPerTurn = totalMinutes / totalTurns;
    const destinationBiome = deriveDestinationBiome(target.type);

    const travelState: SessionTravelState = {
      active: true,
      fromLocationId,
      toLocationId: target.id,
      toLocationName: target.name,
      toLocationType: target.type,
      destinationBiome,
      connectionId: connection?.id ?? null,
      totalMinutes,
      elapsedMinutes: 0,
      totalTurns,
      elapsedTurns: 0,
      minutesPerTurn,
      startedAtIso: new Date().toISOString(),
      reason,
    };

    session.travelState = travelState;
    await this.sessionRepo.save(session);

    const envelope = this.envelopeFactory.build({
      eventCategory: "WorldEvent",
      eventType: "travel_started",
      source: {
        service: "diad-backend",
        module: "MoveToLocationService.runInTransit",
      },
      scope: { sessionId: session.id, campaignId: session.campaignId! },
      payload: {
        sessionId: session.id,
        campaignId: session.campaignId,
        travelState,
      },
      narrativeDescriptor: `Viagem iniciada: ${target.name} (${totalTurns} etapas).`,
    });
    try {
      await this.eventBus.publish(envelope);
    } catch {
      /* swallow */
    }

    this.logger.info("🚶 travel_started", {
      "session.id": session.id,
      "location.from": fromLocationId,
      "location.to": target.id,
      "location.name": target.name,
      "travel.time": travelTime ?? "(none)",
      "travel.minutes": totalMinutes,
      "travel.turns": totalTurns,
      "travel.minutes_per_turn": minutesPerTurn,
      "travel.destination_biome": destinationBiome,
    });

    return {
      travelMode: "in_transit",
      fromLocationId,
      toLocationId: target.id,
      toLocationName: target.name,
      travelTime,
      travelState,
    };
  }

  private async resolveTarget(
    campaignId: string,
    input: MoveToLocationInput,
  ): Promise<LocationEntity> {
    if (input.targetLocationId) {
      const loc = await this.locationService
        .getById(input.targetLocationId)
        .catch(() => null);
      if (!loc || loc.campaignId !== campaignId) {
        throw new DomainException(
          ErrorCode.LOCATION_NOT_FOUND,
          `Location ${input.targetLocationId} não encontrada na campanha.`,
        );
      }
      return loc;
    }
    const name = input.targetLocationName!.trim();
    const loc = await this.locationService.findByNameInCampaign(
      campaignId,
      name,
    );
    if (!loc) {
      throw new DomainException(
        ErrorCode.LOCATION_NOT_FOUND,
        `Location "${name}" não encontrada (ou ambígua) na campanha.`,
        {
          context: { campaignId, name },
          hint: "Verificar nome exato ou usar locationId.",
        },
      );
    }
    return loc;
  }
}
