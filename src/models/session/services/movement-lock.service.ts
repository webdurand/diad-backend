import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SceneEntity } from "src/entities/scene.entity";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { SceneContextCacheService } from "./scene-context-cache.service";

export type MovementLockSource = "director" | "system";

export interface MovementLockState {
  active: true;
  reason: string;
  exitActionLabel: string;
  interlocutorNpcId?: string | null;
  source: MovementLockSource;
  createdAt: string;
}

export interface MovementLockUpdate {
  active?: boolean;
  reason?: string;
  exitActionLabel?: string;
  interlocutorNpcId?: string | null;
  source?: MovementLockSource;
}

export interface ActiveMovementLock {
  sceneId: string;
  locationId: string | null;
  poiId: string | null;
  movementLock: MovementLockState;
}

const DEFAULT_REASON = "Conversa importante em andamento.";
const DEFAULT_EXIT_ACTION = "Encerrar conversa";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

@Injectable()
export class MovementLockService {
  constructor(
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    private readonly contextCache: SceneContextCacheService,
  ) {}

  normalize(value: unknown): MovementLockState | null {
    const raw = asRecord(value);
    if (!raw || raw.active !== true) return null;
    const source = raw.source === "system" ? "system" : "director";
    return {
      active: true,
      reason:
        typeof raw.reason === "string" && raw.reason.trim()
          ? raw.reason.trim()
          : DEFAULT_REASON,
      exitActionLabel:
        typeof raw.exitActionLabel === "string" && raw.exitActionLabel.trim()
          ? raw.exitActionLabel.trim()
          : DEFAULT_EXIT_ACTION,
      interlocutorNpcId:
        typeof raw.interlocutorNpcId === "string"
          ? raw.interlocutorNpcId
          : raw.interlocutorNpcId === null
            ? null
            : undefined,
      source,
      createdAt:
        typeof raw.createdAt === "string" && raw.createdAt.trim()
          ? raw.createdAt
          : new Date().toISOString(),
    };
  }

  async getActiveForSession(
    sessionId: string,
  ): Promise<ActiveMovementLock | null> {
    const scene = await this.getActiveScene(sessionId);
    if (!scene) return null;
    const lock = this.normalize(scene.contextSnapshot?.movementLock);
    if (!lock) return null;
    return {
      sceneId: scene.id,
      locationId: scene.locationId ?? null,
      poiId: scene.poiId ?? null,
      movementLock: lock,
    };
  }

  async setForActiveScene(
    sessionId: string,
    update: MovementLockUpdate,
  ): Promise<MovementLockState | null> {
    const scene = await this.getActiveSceneOrThrow(sessionId);
    if (update.active === false) {
      await this.write(scene, null);
      return null;
    }

    const current = this.normalize(scene.contextSnapshot?.movementLock);
    const movementLock: MovementLockState = {
      active: true,
      reason: update.reason?.trim() || current?.reason || DEFAULT_REASON,
      exitActionLabel:
        update.exitActionLabel?.trim() ||
        current?.exitActionLabel ||
        DEFAULT_EXIT_ACTION,
      interlocutorNpcId:
        update.interlocutorNpcId === undefined
          ? current?.interlocutorNpcId
          : update.interlocutorNpcId,
      source: update.source === "system" ? "system" : "director",
      createdAt: current?.createdAt ?? new Date().toISOString(),
    };

    await this.write(scene, movementLock);
    return movementLock;
  }

  buildBlockedMessage(lock: MovementLockState): string {
    return `Você está preso nesta conversa; ${lock.reason} Use "${lock.exitActionLabel}" antes de se deslocar.`;
  }

  private async getActiveScene(sessionId: string): Promise<SceneEntity | null> {
    return this.sceneRepo.findOne({
      where: { sessionId, isActive: true },
      select: ["id", "sessionId", "locationId", "poiId", "contextSnapshot"],
    });
  }

  private async getActiveSceneOrThrow(sessionId: string): Promise<SceneEntity> {
    const scene = await this.getActiveScene(sessionId);
    if (!scene) {
      throw new DomainException(
        ErrorCode.SCENE_NOT_FOUND,
        "Cena ativa não encontrada para aplicar trava de deslocamento.",
        { context: { sessionId } },
      );
    }
    return scene;
  }

  private async write(
    scene: SceneEntity,
    movementLock: MovementLockState | null,
  ): Promise<void> {
    const snapshot: Record<string, any> = {
      ...(scene.contextSnapshot ?? {}),
    };
    if (movementLock) {
      snapshot.movementLock = movementLock;
    } else {
      delete snapshot.movementLock;
    }
    await this.sceneRepo.update(scene.id, { contextSnapshot: snapshot });
    this.contextCache.invalidate(scene.id);
  }
}
