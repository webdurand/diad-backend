import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SceneEntity } from "src/entities/scene.entity";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { SceneContextCacheService } from "./scene-context-cache.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";

export type MovementLockSource = "director" | "system";

export interface MovementLockAnchor {
  sceneId: string;
  locationId: string | null;
  poiId: string | null;
  interlocutorNpcId?: string | null;
}

export interface MovementLockState {
  active: true;
  reason: string;
  exitActionLabel: string;
  interlocutorNpcId?: string | null;
  anchor?: MovementLockAnchor;
  source: MovementLockSource;
  createdAt: string;
}

export interface MovementLockUpdate {
  active?: boolean;
  reason?: string;
  exitActionLabel?: string;
  interlocutorNpcId?: string | null;
  anchor?: Partial<MovementLockAnchor> | null;
  source?: MovementLockSource;
}

export interface ActiveMovementLock {
  sceneId: string;
  locationId: string | null;
  poiId: string | null;
  movementLock: MovementLockState;
}

const DEFAULT_REASON = "Conversa importante em andamento.";
const DEFAULT_EXIT_ACTION = "Sair da conversa";

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
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
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
      anchor: this.normalizeAnchor(raw.anchor),
      source,
      createdAt:
        typeof raw.createdAt === "string" && raw.createdAt.trim()
          ? raw.createdAt
          : new Date().toISOString(),
    };
  }

  getForScene(
    scene: Pick<
      SceneEntity,
      | "id"
      | "locationId"
      | "poiId"
      | "currentInterlocutorNpcId"
      | "contextSnapshot"
    >,
  ): MovementLockState | null {
    const explicitLock = this.normalize(scene.contextSnapshot?.movementLock);
    if (explicitLock) return explicitLock;
    if (!scene.currentInterlocutorNpcId) return null;

    return {
      active: true,
      reason: DEFAULT_REASON,
      exitActionLabel: DEFAULT_EXIT_ACTION,
      interlocutorNpcId: scene.currentInterlocutorNpcId,
      anchor: this.buildAnchor(
        scene,
        null,
        undefined,
        scene.currentInterlocutorNpcId,
      ),
      source: "system",
      createdAt: new Date().toISOString(),
    };
  }

  async getActiveForSession(
    sessionId: string,
  ): Promise<ActiveMovementLock | null> {
    const scene = await this.getActiveScene(sessionId);
    if (!scene) return null;
    const lock = this.getForScene(scene);
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
    const current = this.normalize(scene.contextSnapshot?.movementLock);
    if (update.active === false) {
      await this.write(scene, null);
      await this.publishMovementLockChanged(scene, current, null);
      return null;
    }

    const interlocutorNpcId =
      update.interlocutorNpcId === undefined
        ? current?.interlocutorNpcId
        : update.interlocutorNpcId;
    const movementLock: MovementLockState = {
      active: true,
      reason: update.reason?.trim() || current?.reason || DEFAULT_REASON,
      exitActionLabel:
        update.exitActionLabel?.trim() ||
        current?.exitActionLabel ||
        DEFAULT_EXIT_ACTION,
      interlocutorNpcId,
      anchor: this.buildAnchor(scene, update.anchor, current?.anchor, interlocutorNpcId),
      source: update.source === "system" ? "system" : "director",
      createdAt: current?.createdAt ?? new Date().toISOString(),
    };

    await this.write(scene, movementLock);
    await this.publishMovementLockChanged(scene, current, movementLock);
    return movementLock;
  }

  buildBlockedMessage(lock: MovementLockState): string {
    return `Você está preso nesta conversa; ${lock.reason} Use "${lock.exitActionLabel}" antes de se deslocar.`;
  }

  private normalizeAnchor(value: unknown): MovementLockAnchor | undefined {
    const raw = asRecord(value);
    if (!raw || typeof raw.sceneId !== "string") return undefined;
    return {
      sceneId: raw.sceneId,
      locationId:
        typeof raw.locationId === "string"
          ? raw.locationId
          : raw.locationId === null
            ? null
            : null,
      poiId:
        typeof raw.poiId === "string"
          ? raw.poiId
          : raw.poiId === null
            ? null
            : null,
      interlocutorNpcId:
        typeof raw.interlocutorNpcId === "string"
          ? raw.interlocutorNpcId
          : raw.interlocutorNpcId === null
            ? null
            : undefined,
    };
  }

  private buildAnchor(
    scene: Pick<SceneEntity, "id" | "locationId" | "poiId">,
    updateAnchor: Partial<MovementLockAnchor> | null | undefined,
    currentAnchor: MovementLockAnchor | undefined,
    interlocutorNpcId: string | null | undefined,
  ): MovementLockAnchor {
    return {
      sceneId: updateAnchor?.sceneId ?? currentAnchor?.sceneId ?? scene.id,
      locationId:
        updateAnchor?.locationId ?? currentAnchor?.locationId ?? scene.locationId ?? null,
      poiId: updateAnchor?.poiId ?? currentAnchor?.poiId ?? scene.poiId ?? null,
      interlocutorNpcId:
        updateAnchor?.interlocutorNpcId ??
        currentAnchor?.interlocutorNpcId ??
        interlocutorNpcId,
    };
  }

  private async getActiveScene(sessionId: string): Promise<SceneEntity | null> {
    return this.sceneRepo.findOne({
      where: { sessionId, isActive: true },
      select: [
        "id",
        "sessionId",
        "locationId",
        "poiId",
        "currentInterlocutorNpcId",
        "contextSnapshot",
      ],
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

  private async publishMovementLockChanged(
    scene: Pick<SceneEntity, "id" | "sessionId" | "locationId" | "poiId">,
    before: MovementLockState | null,
    after: MovementLockState | null,
  ): Promise<void> {
    try {
      const envelope = this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "movement_lock_changed",
        source: {
          service: "diad-backend",
          module: "MovementLockService.setForActiveScene",
        },
        scope: {
          campaignId: "",
          sessionId: scene.sessionId,
          sceneId: scene.id,
        },
        audiences: ["HUD"],
        narrativeDescriptor: after
          ? `Trava de diálogo ativada: ${after.reason}`
          : "Trava de diálogo encerrada.",
        payload: {
          sessionId: scene.sessionId,
          sceneId: scene.id,
          locationId: scene.locationId ?? null,
          poiId: scene.poiId ?? null,
          activeBefore: Boolean(before?.active),
          activeAfter: Boolean(after?.active),
          lockBefore: before,
          lockAfter: after,
        },
      });
      await this.eventBus.publish(envelope);
    } catch {
      /* best-effort HUD sync; lock state itself is already persisted */
    }
  }
}
