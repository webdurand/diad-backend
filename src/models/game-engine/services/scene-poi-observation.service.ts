import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "crypto";
import { Repository } from "typeorm";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { LocationPoiEntity } from "src/entities/location-poi.entity";
import { SceneEntity } from "src/entities/scene.entity";
import {
  ScenePoiObservationEntity,
  type ScenePoiObservationFreshness,
} from "src/entities/scene-poi-observation.entity";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

const DEFAULT_DECAY_TURNS = 5;
const DEFAULT_STALE_GRACE_TURNS = 2;

export interface FindOrGenerateScenePoiObservationInput {
  sessionId: string;
  poiId: string;
  currentTurn?: number;
  currentSceneId?: string;
}

export interface ScenePoiObservationDto {
  id: string;
  sessionId: string;
  poiId: string;
  lastSceneId: string | null;
  observationText: string;
  generatedAtTurn: number;
  expiresAtTurn: number;
  freshness: ScenePoiObservationFreshness;
}

@Injectable()
export class ScenePoiObservationService {
  constructor(
    @InjectRepository(ScenePoiObservationEntity)
    private readonly observationRepo: Repository<ScenePoiObservationEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(LocationPoiEntity)
    private readonly poiRepo: Repository<LocationPoiEntity>,
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
  ) {}

  async findOrGenerate(
    input: FindOrGenerateScenePoiObservationInput,
  ): Promise<ScenePoiObservationDto> {
    const session = await this.sessionRepo.findOne({
      where: { id: input.sessionId },
    });
    if (!session) {
      throw new DomainException(
        ErrorCode.SCENE_POI_OBSERVATION_NOT_FOUND,
        `Sessão ${input.sessionId} não encontrada para observação de POI.`,
      );
    }

    const poi = await this.poiRepo.findOne({
      where: { id: input.poiId },
      relations: ["location"],
    });
    if (!poi || (session.campaignId && poi.campaignId !== session.campaignId)) {
      throw new DomainException(
        ErrorCode.SCENE_POI_OBSERVATION_INVALID_POI,
        "POI inválido para a sessão atual.",
        {
          context: {
            sessionId: input.sessionId,
            poiId: input.poiId,
            campaignId: session.campaignId ?? undefined,
          },
        },
      );
    }

    const activeScene = await this.resolveScene(input);
    const currentTurn = input.currentTurn ?? activeScene?.sceneNumber ?? 0;
    const currentSceneId = input.currentSceneId ?? activeScene?.id ?? null;
    const decayTurns = this.readPositiveConfigNumber(
      session.config?.poiObservationDecayTurns,
      DEFAULT_DECAY_TURNS,
    );
    const staleGraceTurns = this.readPositiveConfigNumber(
      session.config?.poiObservationStaleGraceTurns,
      DEFAULT_STALE_GRACE_TURNS,
    );

    const existing = await this.observationRepo.findOne({
      where: { sessionId: input.sessionId, poiId: input.poiId },
    });
    if (existing) {
      const freshness = this.deriveFreshness(
        currentTurn,
        existing.expiresAtTurn,
        staleGraceTurns,
      );
      if (freshness !== "expired") {
        return this.toDto({ ...existing, freshness });
      }

      existing.observationText = this.generateObservationText(
        poi,
        currentSceneId ?? input.sessionId,
      );
      existing.generatedAtTurn = currentTurn;
      existing.expiresAtTurn = currentTurn + decayTurns;
      existing.lastSceneId = currentSceneId;
      existing.freshness = "fresh";
      return this.toDto(await this.observationRepo.save(existing));
    }

    const created = this.observationRepo.create({
      sessionId: input.sessionId,
      poiId: input.poiId,
      lastSceneId: currentSceneId,
      observationText: this.generateObservationText(
        poi,
        currentSceneId ?? input.sessionId,
      ),
      generatedAtTurn: currentTurn,
      expiresAtTurn: currentTurn + decayTurns,
      freshness: "fresh",
    });
    return this.toDto(await this.observationRepo.save(created));
  }

  private async resolveScene(
    input: FindOrGenerateScenePoiObservationInput,
  ): Promise<SceneEntity | null> {
    if (input.currentSceneId) {
      return this.sceneRepo.findOne({
        where: { id: input.currentSceneId, sessionId: input.sessionId },
      });
    }
    return this.sceneRepo.findOne({
      where: { sessionId: input.sessionId, isActive: true },
      order: { sceneNumber: "DESC" },
    });
  }

  private deriveFreshness(
    currentTurn: number,
    expiresAtTurn: number,
    staleGraceTurns: number,
  ): ScenePoiObservationFreshness {
    if (currentTurn < expiresAtTurn) return "fresh";
    if (currentTurn <= expiresAtTurn + staleGraceTurns) return "stale";
    return "expired";
  }

  private generateObservationText(
    poi: LocationPoiEntity,
    seedSource: string,
  ): string {
    const variants = [
      `Algo em ${poi.name} mudou de lugar desde sua última passada.`,
      `Um detalhe novo chama atenção em ${poi.name}, pequeno demais para ser acaso.`,
      `${poi.name} parece guardar uma tensão baixa, como conversa interrompida.`,
      `O ar em ${poi.name} traz sinais recentes de presença e pressa.`,
      `Uma marca recente em ${poi.name} sugere que alguém esteve aqui há pouco.`,
    ];
    const seed = createHash("sha256")
      .update(`${seedSource}:${poi.id}:${poi.name}`)
      .digest("hex");
    const index = parseInt(seed.slice(0, 8), 16) % variants.length;
    return variants[index];
  }

  private readPositiveConfigNumber(
    value: unknown,
    fallback: number,
  ): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      return fallback;
    }
    return value;
  }

  private toDto(
    observation: ScenePoiObservationEntity,
  ): ScenePoiObservationDto {
    return {
      id: observation.id,
      sessionId: observation.sessionId,
      poiId: observation.poiId,
      lastSceneId: observation.lastSceneId ?? null,
      observationText: observation.observationText,
      generatedAtTurn: observation.generatedAtTurn,
      expiresAtTurn: observation.expiresAtTurn,
      freshness: observation.freshness,
    };
  }
}
