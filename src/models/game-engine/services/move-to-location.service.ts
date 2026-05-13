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
import { SceneContextCacheService } from "src/models/session/services/scene-context-cache.service";
import { MovementLockService } from "src/models/session/services/movement-lock.service";
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

export type TravelResolveStatus =
  | "direct"
  | "route_required"
  | "no_known_route"
  | "blocked"
  | "not_found"
  | "already_there";

export interface TravelResolveLocation {
  id: string;
  name: string;
  type: string;
}

export type TravelResolveResult =
  | {
      status: "direct";
      destination: TravelResolveLocation;
      fromLocationId: string | null;
      directTravel?: AvailableTravel;
      message: string;
    }
  | {
      status: "route_required";
      destination: TravelResolveLocation;
      fromLocationId: string;
      nextHop: AvailableTravel;
      route: Array<TravelResolveLocation>;
      message: string;
    }
  | {
      status: "no_known_route";
      destination: TravelResolveLocation;
      fromLocationId: string | null;
      availableTravels: AvailableTravel[];
      message: string;
    }
  | {
      status: "blocked";
      destination?: TravelResolveLocation;
      fromLocationId: string | null;
      directTravel?: AvailableTravel;
      reason: string;
      message: string;
    }
  | {
      status: "not_found";
      targetLocationName?: string;
      suggestions: TravelResolveLocation[];
      message: string;
    }
  | {
      status: "already_there";
      destination: TravelResolveLocation;
      fromLocationId: string;
      sceneId: string;
      message: string;
    };

const OUTDOOR_TYPES = new Set(["wilderness", "dungeon", "dungeon_room"]);

function deriveDestinationBiome(toLocationType: string): string {
  if (OUTDOOR_TYPES.has(toLocationType)) return toLocationType;
  return "road";
}

function normalizeLocationText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toResolveLocation(location: LocationEntity): TravelResolveLocation {
  return { id: location.id, name: location.name, type: location.type };
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
    private readonly contextCache: SceneContextCacheService,
    private readonly movementLockService: MovementLockService,
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

    const activeLock = await this.movementLockService.getActiveForSession(
      input.sessionId,
    );
    if (activeLock) {
      throw new DomainException(
        ErrorCode.VALIDATION_INVALID_PAYLOAD,
        this.movementLockService.buildBlockedMessage(activeLock.movementLock),
        {
          context: {
            sessionId: session.id,
            sceneId: activeLock.sceneId,
            reason: "movement_lock",
          },
        },
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

  async resolveTravel(
    input: MoveToLocationInput,
  ): Promise<TravelResolveResult> {
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
      return {
        status: "blocked",
        fromLocationId: null,
        reason: "session_without_campaign",
        message: "Esta sessão não tem campanha vinculada para resolver viagem.",
      };
    }

    if (session.travelState?.active) {
      return {
        status: "blocked",
        fromLocationId: session.travelState.fromLocationId,
        destination: {
          id: session.travelState.toLocationId,
          name: session.travelState.toLocationName,
          type: session.travelState.toLocationType,
        },
        reason: "travel_already_active",
        message: `Já existe uma viagem em andamento para ${session.travelState.toLocationName}.`,
      };
    }

    const activeLock = await this.movementLockService.getActiveForSession(
      input.sessionId,
    );
    if (activeLock) {
      return {
        status: "blocked",
        fromLocationId: activeLock.locationId,
        reason: "movement_lock",
        message: this.movementLockService.buildBlockedMessage(
          activeLock.movementLock,
        ),
      };
    }

    const locations = await this.locationService.listByCampaign(
      session.campaignId,
    );
    const target = await this.resolveTargetLoose(
      session.campaignId,
      input,
      locations,
    );
    if (!target) {
      return {
        status: "not_found",
        targetLocationName: input.targetLocationName?.trim(),
        suggestions: this.suggestLocations(input.targetLocationName, locations),
        message: input.targetLocationName
          ? `Não encontrei "${input.targetLocationName}" como lugar conhecido deste mundo.`
          : "Preciso de um destino para resolver a viagem.",
      };
    }

    const currentScene = await this.sceneService.getActive(input.sessionId);
    const fromLocationId = currentScene?.locationId ?? null;
    if (fromLocationId === target.id) {
      return {
        status: "already_there",
        destination: toResolveLocation(target),
        fromLocationId,
        sceneId: currentScene!.id,
        message: `Você já está em ${target.name}.`,
      };
    }

    const availableTravels = await this.listAvailableTravels(input.sessionId);

    if (!fromLocationId) {
      return {
        status: "direct",
        destination: toResolveLocation(target),
        fromLocationId: null,
        message: `${target.name} pode ser definido como próximo destino.`,
      };
    }

    const directConnection = await this.connectionRepo.findOne({
      where: { fromLocationId, toLocationId: target.id },
      relations: ["toLocation"],
    });
    if (directConnection) {
      const directTravel = this.toAvailableTravel(directConnection, target);
      if (directConnection.isLocked) {
        return {
          status: "blocked",
          destination: toResolveLocation(target),
          fromLocationId,
          directTravel,
          reason: "connection_locked",
          message: `O caminho direto para ${target.name} existe, mas está bloqueado.`,
        };
      }
      if (directConnection.isHidden) {
        return {
          status: "blocked",
          destination: toResolveLocation(target),
          fromLocationId,
          directTravel,
          reason: "connection_hidden",
          message: `Existe um caminho para ${target.name}, mas ele ainda não foi descoberto.`,
        };
      }
      return {
        status: "direct",
        destination: toResolveLocation(target),
        fromLocationId,
        directTravel,
        message: `Destino conectado: iniciar viagem para ${target.name}.`,
      };
    }

    const route = await this.findKnownRoute(
      fromLocationId,
      target.id,
      locations,
    );
    if (route.length >= 2) {
      const nextHopLocationId = route[1];
      const nextHopLocation = locations.find((l) => l.id === nextHopLocationId);
      const nextConnection = await this.connectionRepo.findOne({
        where: { fromLocationId, toLocationId: nextHopLocationId },
        relations: ["toLocation"],
      });
      if (nextConnection && nextHopLocation) {
        return {
          status: "route_required",
          destination: toResolveLocation(target),
          fromLocationId,
          nextHop: this.toAvailableTravel(nextConnection, nextHopLocation),
          route: route
            .map((locationId) => locations.find((l) => l.id === locationId))
            .filter((l): l is LocationEntity => Boolean(l))
            .map(toResolveLocation),
          message: `Para chegar a ${target.name}, primeiro vá até ${nextHopLocation.name}.`,
        };
      }
    }

    return {
      status: "no_known_route",
      destination: toResolveLocation(target),
      fromLocationId,
      availableTravels,
      message: `Não há rota conhecida daqui até ${target.name}.`,
    };
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

    const activeScene = await this.sceneService.getActive(session.id);
    if (activeScene?.id) this.contextCache.invalidate(activeScene.id);

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
    const loc =
      (await this.locationService.findByNameInCampaign(campaignId, name)) ??
      (await this.resolveTargetLoose(campaignId, input));
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

  private toAvailableTravel(
    connection: LocationConnectionEntity,
    toLocation: LocationEntity,
  ): AvailableTravel {
    return {
      connectionId: connection.id,
      toLocationId: connection.toLocationId,
      toLocationName: toLocation.name,
      toLocationType: toLocation.type,
      travelTime: connection.travelTime ?? null,
      description: connection.description ?? null,
      isLocked: connection.isLocked,
      requirements: connection.requirements ?? {},
    };
  }

  private async resolveTargetLoose(
    campaignId: string,
    input: MoveToLocationInput,
    knownLocations?: LocationEntity[],
  ): Promise<LocationEntity | null> {
    if (input.targetLocationId) {
      const loc = await this.locationService
        .getById(input.targetLocationId)
        .catch(() => null);
      return loc?.campaignId === campaignId ? loc : null;
    }
    const rawName = input.targetLocationName?.trim();
    if (!rawName) return null;
    const locations =
      knownLocations ?? (await this.locationService.listByCampaign(campaignId));
    const needle = normalizeLocationText(rawName);
    if (!needle) return null;

    const scored = locations
      .map((location) => ({
        location,
        score: this.scoreLocationMatch(location, needle),
      }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 45) return null;
    const tied = scored.filter((m) => m.score === best.score);
    if (tied.length > 1 && best.score >= 80) return null;
    return best.location;
  }

  private scoreLocationMatch(location: LocationEntity, needle: string): number {
    const terms = this.locationSearchTerms(location)
      .map(normalizeLocationText)
      .filter(Boolean);
    if (terms.some((term) => term === needle)) return 100;
    if (terms.some((term) => term.includes(needle))) return 85;
    if (terms.some((term) => needle.includes(term) && term.length >= 4)) {
      return 75;
    }
    const description = normalizeLocationText(location.description ?? "");
    if (description.includes(needle) && needle.length >= 5) return 50;
    const tokens = needle.split(" ").filter((t) => t.length >= 4);
    if (
      tokens.length > 0 &&
      tokens.every(
        (token) =>
          terms.some((term) => term.includes(token)) ||
          description.includes(token),
      )
    ) {
      return 45;
    }
    return 0;
  }

  private locationSearchTerms(location: LocationEntity): string[] {
    const props = (location.properties ?? {}) as Record<string, unknown>;
    const aliases = [
      props.aliases,
      props.alias,
      props.knownAs,
      props.region,
      props.regionName,
    ]
      .flat()
      .filter((v): v is string => typeof v === "string");
    return [
      location.name,
      location.slug,
      ...(location.tags ?? []),
      ...aliases,
    ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  }

  private suggestLocations(
    rawName: string | undefined,
    locations: LocationEntity[],
  ): TravelResolveLocation[] {
    const needle = normalizeLocationText(rawName ?? "");
    if (!needle) return locations.slice(0, 4).map(toResolveLocation);
    return locations
      .map((location) => ({
        location,
        score: this.scoreLocationMatch(location, needle),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((m) => toResolveLocation(m.location));
  }

  private async findKnownRoute(
    fromLocationId: string,
    toLocationId: string,
    locations: LocationEntity[],
  ): Promise<string[]> {
    const locationIds = new Set(locations.map((l) => l.id));
    const connections = await this.connectionRepo.find({
      where: { isHidden: false, isLocked: false },
    });
    const outgoing = new Map<string, LocationConnectionEntity[]>();
    for (const connection of connections) {
      if (
        !locationIds.has(connection.fromLocationId) ||
        !locationIds.has(connection.toLocationId)
      ) {
        continue;
      }
      const list = outgoing.get(connection.fromLocationId) ?? [];
      list.push(connection);
      outgoing.set(connection.fromLocationId, list);
    }

    const queue: Array<{ id: string; path: string[] }> = [
      { id: fromLocationId, path: [fromLocationId] },
    ];
    const visited = new Set<string>([fromLocationId]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const connection of outgoing.get(current.id) ?? []) {
        if (visited.has(connection.toLocationId)) continue;
        const path = [...current.path, connection.toLocationId];
        if (connection.toLocationId === toLocationId) return path;
        visited.add(connection.toLocationId);
        queue.push({ id: connection.toLocationId, path });
      }
    }
    return [];
  }
}
