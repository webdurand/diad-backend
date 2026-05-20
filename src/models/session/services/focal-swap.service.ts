import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { SceneEntity } from "src/entities/scene.entity";
import { SceneNpcEntity } from "src/entities/scene-npc.entity";
import { SceneContextCacheService } from "./scene-context-cache.service";

export interface FocalSwapResult {
  sceneId: string;
  previousFocalNpcId: string | null;
  newFocalNpcId: string;
}

@Injectable()
export class FocalSwapService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cache: SceneContextCacheService,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
  ) {}

  async swap(
    sceneId: string,
    npcId: string,
    characterId?: string,
  ): Promise<FocalSwapResult> {
    const { scene, result } = await this.dataSource.transaction(async (manager) => {
      const scene = await manager.findOne(SceneEntity, { where: { id: sceneId } });
      if (!scene) {
        throw new DomainException(ErrorCode.SCENE_NOT_FOUND, "Cena não encontrada.", {
          context: { sceneId },
        });
      }
      if (!scene.socialCollective) {
        throw new DomainException(
          ErrorCode.SESSION_SOCIAL_COLLECTIVE_REQUIRED,
          "Troca de interlocutor exige cena social coletiva.",
          { context: { sceneId, sessionId: scene.sessionId } },
        );
      }

      const sceneNpc = await manager.findOne(SceneNpcEntity, {
        where: { sceneId, npcId },
      });
      if (!sceneNpc) {
        throw new DomainException(
          ErrorCode.NPC_FOCAL_NOT_IN_SCENE,
          "NPC focal precisa estar presente na cena.",
          { context: { sceneId, npcId } },
        );
      }

      await manager.update(
        SceneNpcEntity,
        { sceneId, presenceRole: "interlocutor" },
        { presenceRole: "present" },
      );
      await manager.update(
        SceneNpcEntity,
        { sceneId, npcId },
        { presenceRole: "interlocutor" },
      );
      await manager.update(SceneEntity, sceneId, {
        currentInterlocutorNpcId: npcId,
      });

      return {
        scene,
        result: {
          sceneId,
          previousFocalNpcId: scene.currentInterlocutorNpcId ?? null,
          newFocalNpcId: npcId,
        },
      };
    });
    this.cache.invalidate(sceneId);
    await this.publishFocalSwapped(scene, result, characterId);
    return result;
  }

  private async publishFocalSwapped(
    scene: SceneEntity,
    result: FocalSwapResult,
    characterId?: string,
  ): Promise<void> {
    const envelope = this.envelopeFactory.build({
      eventCategory: "NarrativeEvent",
      eventType: "dialogue_focal_swapped",
      source: {
        service: "diad-backend",
        module: "FocalSwapService.swap",
      },
      scope: {
        campaignId: "",
        sessionId: scene.sessionId,
        sceneId: scene.id,
      },
      audiences: ["Director", "Narrator", "HUD", "Archivist"],
      narrativeDescriptor: "Interlocutor focal trocado em diálogo coletivo.",
      payload: {
        sceneId: scene.id,
        sessionId: scene.sessionId,
        previousFocalNpcId: result.previousFocalNpcId,
        newFocalNpcId: result.newFocalNpcId,
        characterId: characterId ?? null,
      },
    });
    await this.eventBus.publish(envelope);
  }
}
