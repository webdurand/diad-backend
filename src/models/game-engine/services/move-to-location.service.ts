import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { LocationConnectionEntity } from "src/entities/location-connection.entity";
import { LocationEntity } from "src/entities/location.entity";
import { LocationService } from "src/models/world/services/location.service";
import { SceneService } from "src/models/session/services/scene.service";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";

export interface MoveToLocationInput {
  sessionId: string;
  targetLocationId?: string;
  targetLocationName?: string;
  reason?: string;
}

export interface MoveToLocationResult {
  sceneId: string;
  fromLocationId: string | null;
  toLocationId: string;
  toLocationName: string;
  travelTime: string | null;
  alreadyThere: boolean;
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

    const target = await this.resolveTarget(session.campaignId, input);

    const currentScene = await this.sceneService.getActive(input.sessionId);
    const fromLocationId = currentScene?.locationId ?? null;

    if (fromLocationId === target.id) {
      return {
        sceneId: currentScene!.id,
        fromLocationId,
        toLocationId: target.id,
        toLocationName: target.name,
        travelTime: null,
        alreadyThere: true,
      };
    }

    let travelTime: string | null = null;
    if (fromLocationId) {
      const connection = await this.connectionRepo.findOne({
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

    const newScene = await this.sceneService.create(input.sessionId, {
      locationId: target.id,
      title: target.name,
      reason: input.reason ?? "movement",
    });

    await this.locationService.markVisited(target.id);

    this.logger.info("move_to_location.completed", {
      "session.id": input.sessionId,
      "scene.id": newScene.id,
      "location.from": fromLocationId ?? "(none)",
      "location.to": target.id,
      "location.name": target.name,
      "travel.time": travelTime ?? "(none)",
    });

    return {
      sceneId: newScene.id,
      fromLocationId,
      toLocationId: target.id,
      toLocationName: target.name,
      travelTime,
      alreadyThere: false,
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
