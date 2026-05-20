import { Injectable, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SceneNpcEntity } from "src/entities/scene-npc.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { SceneService } from "src/models/session/services/scene.service";
import {
  MovementLockService,
  type MovementLockState,
} from "src/models/session/services/movement-lock.service";

export interface DialogueStartInput {
  npcId: string;
  reason?: string;
}

export interface DialogueExitResult {
  status: "exited" | "no_dialogue";
  sceneId: string;
  locationId: string | null;
  poiId: string | null;
  npcId: string | null;
  movementLock: null;
  message: string;
}

export interface DialogueStartResult {
  status: "started";
  sceneId: string;
  locationId: string | null;
  poiId: string | null;
  npc: {
    id: string;
    name: string;
    title?: string | null;
  };
  movementLock: MovementLockState | null;
  message: string;
}

const EXIT_ACTION_LABEL = "Sair da conversa";

@Injectable()
export class DialogueActionService {
  constructor(
    private readonly sceneService: SceneService,
    @InjectRepository(SceneNpcEntity)
    private readonly sceneNpcRepo: Repository<SceneNpcEntity>,
    private readonly movementLockService: MovementLockService,
    @Optional()
    private readonly eventBus?: EventBusService,
    @Optional()
    private readonly envelopeFactory?: EventEnvelopeFactory,
  ) {}

  async start(
    sessionId: string,
    input: DialogueStartInput,
  ): Promise<DialogueStartResult> {
    const scene = await this.getActiveSceneOrThrow(sessionId);
    const sceneNpc = await this.sceneNpcRepo.findOne({
      where: { sceneId: scene.id, npcId: input.npcId },
      relations: ["npc"],
    });
    if (!sceneNpc?.npc) {
      throw new DomainException(
        ErrorCode.NPC_NOT_FOUND,
        "NPC não está presente na cena atual para iniciar diálogo.",
        {
          context: {
            sessionId,
            sceneId: scene.id,
            npcId: input.npcId,
          },
        },
      );
    }

    await this.sceneService.addNpcToScene(scene.id, input.npcId, "interlocutor");
    const reason =
      input.reason?.trim() || `Conversa com ${sceneNpc.npc.name} em andamento.`;
    const movementLock = await this.movementLockService.setForActiveScene(
      sessionId,
      {
        active: true,
        reason,
        exitActionLabel: EXIT_ACTION_LABEL,
        interlocutorNpcId: input.npcId,
        source: "system",
      },
    );
    await this.publishDialogueEvent("dialogue_started", {
      sessionId,
      sceneId: scene.id,
      npcId: input.npcId,
      locationId: scene.locationId ?? null,
      poiId: scene.poiId ?? null,
    });

    return {
      status: "started",
      sceneId: scene.id,
      locationId: scene.locationId ?? null,
      poiId: scene.poiId ?? null,
      npc: {
        id: sceneNpc.npc.id,
        name: sceneNpc.npc.name,
        title: sceneNpc.npc.title ?? null,
      },
      movementLock,
      message: `Você iniciou conversa com ${sceneNpc.npc.name}.`,
    };
  }

  async exit(sessionId: string): Promise<DialogueExitResult> {
    const scene = await this.getActiveSceneOrThrow(sessionId);
    const activeLock =
      await this.movementLockService.getActiveForSession(sessionId);
    const npcId =
      activeLock?.movementLock.interlocutorNpcId ??
      scene.currentInterlocutorNpcId ??
      null;

    if (activeLock) {
      await this.movementLockService.setForActiveScene(sessionId, {
        active: false,
      });
    }
    await this.sceneNpcRepo.update(
      { sceneId: scene.id, presenceRole: "interlocutor" },
      { presenceRole: "present" },
    );
    await this.sceneService.update(scene.id, {
      currentInterlocutorNpcId: null,
    });
    if (activeLock || scene.currentInterlocutorNpcId) {
      await this.publishDialogueEvent("dialogue_exited", {
        sessionId,
        sceneId: scene.id,
        npcId,
        locationId: scene.locationId ?? null,
        poiId: scene.poiId ?? null,
      });
    }

    return {
      status: activeLock || scene.currentInterlocutorNpcId ? "exited" : "no_dialogue",
      sceneId: scene.id,
      locationId: scene.locationId ?? null,
      poiId: scene.poiId ?? null,
      npcId,
      movementLock: null,
      message: activeLock
        ? "Você saiu da conversa."
        : "Não havia uma conversa ativa.",
    };
  }

  private async getActiveSceneOrThrow(sessionId: string) {
    const scene = await this.sceneService.getActive(sessionId);
    if (!scene) {
      throw new DomainException(
        ErrorCode.SCENE_NOT_FOUND,
        "Cena ativa não encontrada para ação de diálogo.",
        { context: { sessionId } },
      );
    }
    return scene;
  }

  private async publishDialogueEvent(
    eventType: "dialogue_started" | "dialogue_exited",
    payload: {
      sessionId: string;
      sceneId: string;
      npcId: string | null;
      locationId: string | null;
      poiId: string | null;
    },
  ): Promise<void> {
    if (!this.eventBus || !this.envelopeFactory) return;
    const envelope = this.envelopeFactory.build({
      eventCategory: "NarrativeEvent",
      eventType,
      source: {
        service: "diad-backend",
        module: "DialogueActionService",
      },
      scope: {
        campaignId: "",
        sessionId: payload.sessionId,
        sceneId: payload.sceneId,
      },
      audiences: ["Director", "Narrator", "HUD", "Archivist"],
      narrativeDescriptor:
        eventType === "dialogue_started"
          ? "Diálogo iniciado."
          : "Diálogo encerrado.",
      payload,
    });
    await this.eventBus.publish(envelope);
  }
}
