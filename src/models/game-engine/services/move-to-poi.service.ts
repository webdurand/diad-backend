import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { SceneNpcEntity } from "src/entities/scene-npc.entity";
import { LocationPoiEntity } from "src/entities/location-poi.entity";
import { LocationPoiService } from "src/models/world/services/location-poi.service";
import { SceneService } from "src/models/session/services/scene.service";
import { SceneContextCacheService } from "src/models/session/services/scene-context-cache.service";
import { MetaQueryService } from "src/models/session/services/meta-query.service";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import {
  MovementLockService,
  type MovementLockState,
} from "src/models/session/services/movement-lock.service";
import { SessionNpcStateService } from "src/models/world/services/session-npc-state.service";
import { getDialogueWeight, type DialogueWeight } from "src/shared/dialogue-weight";
import { deriveSceneMode, type SceneMode } from "src/shared/scene-mode";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import {
  DialogueActionGeneratorService,
  type DialogueAction,
} from "./dialogue-action-generator.service";
import { OpenModeActionGeneratorService } from "./open-mode-action-generator.service";

export interface MoveToPoiInput {
  sessionId: string;
  targetPoiId?: string;
  targetPoiName?: string;
  reason?: string;
}

export type MoveToPoiStatus =
  | "moved"
  | "already_there"
  | "not_found"
  | "blocked"
  | "hidden";

export type MoveToPoiResult =
  | {
      status: "moved";
      sceneId: string;
      locationId: string;
      fromPoiId: string | null;
      toPoi: AvailablePoi;
      companionsCarried: Array<{ npcId: string; name?: string }>;
      message: string;
    }
  | {
      status: "already_there";
      sceneId: string;
      locationId: string;
      toPoi: AvailablePoi;
      message: string;
    }
  | {
      status: "not_found";
      targetPoiName?: string;
      suggestions: AvailablePoi[];
      message: string;
    }
  | {
      status: "blocked";
      reason: string;
      currentPoi?: AvailablePoi | null;
      targetPoi?: AvailablePoi | null;
      message: string;
    }
  | {
      status: "hidden";
      message: string;
    };

export interface AvailablePoi {
  id: string;
  name: string;
  type: string;
  description: string | null;
  atmosphere: string | null;
  aliases: string[];
  tags: string[];
  isDefault: boolean;
  isLocked: boolean;
  phaseIndex: number | null;
}

export interface AvailablePoisEnvelope {
  sceneId: string | null;
  sceneMode: SceneMode;
  socialCollective: boolean;
  focalNpcId: string | null;
  metaQueryRemaining: number;
  bimodalLoopEnabled: boolean;
  hubPoiEnabled: boolean;
  location: { id: string; name: string; type: string } | null;
  currentPoi: AvailablePoi | null;
  movementLock: MovementLockState | null;
  npcsPresent: Array<{
    id: string;
    name: string;
    title?: string | null;
    presenceRole: string;
    dialogueWeight: DialogueWeight;
    disposition: "unknown";
    tags: string[];
    knowledgeScope: string[];
  }>;
  availableActions: DialogueAction[];
  pois: AvailablePoi[];
}

@Injectable()
export class MoveToPoiService {
  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(SceneNpcEntity)
    private readonly sceneNpcRepo: Repository<SceneNpcEntity>,
    private readonly poiService: LocationPoiService,
    private readonly sceneService: SceneService,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly contextCache: SceneContextCacheService,
    private readonly movementLockService: MovementLockService,
    private readonly logger: DiadLogger,
    private readonly metaQueryService: MetaQueryService,
    private readonly dialogueActionGenerator: DialogueActionGeneratorService,
    private readonly openModeActionGenerator: OpenModeActionGeneratorService,
    private readonly characterSheetService: CharacterSheetService,
    private readonly sessionNpcStateService: SessionNpcStateService,
  ) {
    this.logger.setContext(MoveToPoiService.name);
  }

  async run(input: MoveToPoiInput): Promise<MoveToPoiResult> {
    const session = await this.sessionRepo.findOne({
      where: { id: input.sessionId },
    });
    if (!session) {
      throw new DomainException(
        ErrorCode.SESSION_NOT_FOUND,
        `Sessão ${input.sessionId} não encontrada.`,
      );
    }

    if (session.travelState?.active) {
      return {
        status: "blocked",
        reason: "travel_active",
        message: `Você está em viagem para ${session.travelState.toLocationName}; chegue antes de mudar de área local.`,
      };
    }

    const activeLock = await this.movementLockService.getActiveForSession(
      input.sessionId,
    );
    if (activeLock) {
      return {
        status: "blocked",
        reason: "movement_lock",
        message: this.movementLockService.buildBlockedMessage(
          activeLock.movementLock,
        ),
      };
    }

    const currentScene = await this.sceneService.getActive(input.sessionId);
    if (!currentScene?.locationId) {
      return {
        status: "blocked",
        reason: "scene_without_location",
        message: "A cena atual não tem um local canônico para resolver POIs.",
      };
    }

    const resolved = await this.poiService.resolveInLocation(
      currentScene.locationId,
      {
        targetPoiId: input.targetPoiId,
        targetPoiName: input.targetPoiName,
      },
    );
    if (resolved.status === "not_found") {
      return {
        status: "not_found",
        targetPoiName: input.targetPoiName?.trim(),
        suggestions: resolved.suggestions.map((poi) =>
          this.toAvailablePoi(poi),
        ),
        message: input.targetPoiName
          ? `Não encontrei "${input.targetPoiName}" como ponto local conhecido aqui.`
          : "Preciso de um ponto local mais específico.",
      };
    }
    if (resolved.status === "ambiguous") {
      return {
        status: "not_found",
        targetPoiName: input.targetPoiName?.trim(),
        suggestions: resolved.matches.map((poi) => this.toAvailablePoi(poi)),
        message: `Há mais de um ponto local possível para "${input.targetPoiName}".`,
      };
    }
    if (resolved.status === "hidden") {
      return {
        status: "hidden",
        message:
          "Esse ponto local ainda não foi descoberto em cena. Trate como pista, rumor ou objetivo de investigação.",
      };
    }

    const targetPoi = resolved.poi;
    if (targetPoi.isLocked) {
      return {
        status: "blocked",
        reason: "poi_locked",
        currentPoi: currentScene.poi
          ? this.toAvailablePoi(currentScene.poi)
          : null,
        targetPoi: this.toAvailablePoi(targetPoi),
        message: `${targetPoi.name} está bloqueado por enquanto.`,
      };
    }
    if (currentScene.poiId === targetPoi.id) {
      return {
        status: "already_there",
        sceneId: currentScene.id,
        locationId: currentScene.locationId,
        toPoi: this.toAvailablePoi(targetPoi),
        message: `Você já está em ${targetPoi.name}.`,
      };
    }

    const companions = await this.sceneNpcRepo.find({
      where: { sceneId: currentScene.id, presenceRole: "companion" },
      relations: ["npc"],
    });
    const nextScene = await this.sceneService.create(input.sessionId, {
      locationId: currentScene.locationId,
      poiId: targetPoi.id,
      title: targetPoi.name,
      description: targetPoi.description,
      mood: targetPoi.atmosphere,
      reason: input.reason ?? "poi_movement",
      skipBudgetIncrement: true,
    });
    for (const companion of companions) {
      await this.sceneService.addNpcToScene(
        nextScene.id,
        companion.npcId,
        "companion",
      );
    }
    await this.populateSceneNpcsFromPoi(
      input.sessionId,
      nextScene.id,
      targetPoi.id,
    );
    this.contextCache.invalidate(currentScene.id);
    this.contextCache.invalidate(nextScene.id);

    await this.publishPoiMoved({
      session,
      fromSceneId: currentScene.id,
      toSceneId: nextScene.id,
      locationId: currentScene.locationId,
      fromPoiId: currentScene.poiId ?? null,
      toPoi: targetPoi,
      reason: input.reason ?? "poi_movement",
    });

    return {
      status: "moved",
      sceneId: nextScene.id,
      locationId: currentScene.locationId,
      fromPoiId: currentScene.poiId ?? null,
      toPoi: this.toAvailablePoi(targetPoi),
      companionsCarried: companions.map((companion) => ({
        npcId: companion.npcId,
        name: companion.npc?.name,
      })),
      message: `Você se deslocou para ${targetPoi.name}.`,
    };
  }

  async listAvailablePois(
    sessionId: string,
    userId?: string,
  ): Promise<AvailablePoisEnvelope> {
    const currentScene = await this.sceneService.getActive(sessionId);
    if (!currentScene?.locationId) {
      return {
        sceneId: currentScene?.id ?? null,
        sceneMode: "open",
        socialCollective: false,
        focalNpcId: null,
        metaQueryRemaining: 3,
        bimodalLoopEnabled: true,
        hubPoiEnabled: false,
        location: null,
        currentPoi: null,
        movementLock: null,
        npcsPresent: [],
        availableActions: [],
        pois: [],
      };
    }
    if (currentScene.poiId) {
      await this.populateSceneNpcsFromPoi(
        sessionId,
        currentScene.id,
        currentScene.poiId,
      );
    }
    const [pois, sceneNpcs, session, metaQueryRemaining] = await Promise.all([
      this.poiService.listKnownByLocation(currentScene.locationId),
      this.sceneNpcRepo.find({
        where: { sceneId: currentScene.id },
        relations: ["npc"],
      }),
      this.findSessionForEnvelope(sessionId),
      this.metaQueryService.remainingForScene(sessionId, currentScene.id),
    ]);
    const sceneMode = deriveSceneMode(session, currentScene);
    const bimodalLoopEnabled = session?.config?.bimodalLoopEnabled === true;
    const hubPoiEnabled = session?.config?.hubPoiEnabled === true;
    const npcsPresent = sceneNpcs
      .filter((sceneNpc) => sceneNpc.npc)
      .map((sceneNpc) => ({
        id: sceneNpc.npcId,
        name: sceneNpc.npc.name,
        title: sceneNpc.npc.title ?? null,
        presenceRole: sceneNpc.presenceRole,
        dialogueWeight: getDialogueWeight(sceneNpc.npc),
        disposition: "unknown" as const,
        tags: sceneNpc.npc.tags ?? [],
        knowledgeScope: sceneNpc.npc.knowledgeScope ?? [],
      }));
    const characterSkills = await this.loadProficientSkillSlugs(session, userId);
    const characterKnownFacts = this.extractKnownFacts(sceneNpcs);
    return {
      sceneId: currentScene.id,
      sceneMode,
      socialCollective: currentScene.socialCollective === true,
      focalNpcId: currentScene.currentInterlocutorNpcId ?? null,
      metaQueryRemaining,
      bimodalLoopEnabled,
      hubPoiEnabled,
      location: currentScene.location
        ? {
            id: currentScene.location.id,
            name: currentScene.location.name,
            type: currentScene.location.type,
          }
        : null,
      currentPoi: currentScene.poi
        ? this.toAvailablePoi(currentScene.poi)
        : null,
      movementLock: this.movementLockService.getForScene(currentScene),
      npcsPresent,
      availableActions: this.buildAvailableActions({
        sceneMode,
        npcsPresent,
        focalNpcId: currentScene.currentInterlocutorNpcId ?? null,
        interactables: Array.isArray(currentScene.contextSnapshot?.interactables)
          ? currentScene.contextSnapshot.interactables
          : [],
        characterSkills,
        characterKnownFacts,
      }),
      pois: pois.map((poi) => this.toAvailablePoi(poi)),
    };
  }

  private async findSessionForEnvelope(
    sessionId: string,
  ): Promise<GameSessionEntity | null> {
    if (typeof this.sessionRepo?.findOne !== "function") return null;
    return this.sessionRepo.findOne({ where: { id: sessionId } });
  }

  private async populateSceneNpcsFromPoi(
    sessionId: string,
    sceneId: string,
    poiId: string,
  ): Promise<void> {
    const [states, existingSceneNpcs] = await Promise.all([
      this.sessionNpcStateService.listByPoi(sessionId, poiId),
      this.sceneService.getSceneNpcs(sceneId),
    ]);
    const existingNpcIds = new Set(existingSceneNpcs.map((npc) => npc.npcId));
    for (const state of states) {
      if (state.status !== "alive") continue;
      if (existingNpcIds.has(state.npcId)) continue;
      await this.sceneService.addNpcToScene(sceneId, state.npcId, "present");
      existingNpcIds.add(state.npcId);
    }
  }

  private buildAvailableActions(input: {
    sceneMode: SceneMode;
    npcsPresent: AvailablePoisEnvelope["npcsPresent"];
    focalNpcId: string | null;
    interactables?: Array<Record<string, any>>;
    characterSkills: string[];
    characterKnownFacts: string[];
  }): DialogueAction[] {
    if (input.sceneMode === "dialogue") {
      const focal = input.npcsPresent.find((npc) => npc.id === input.focalNpcId);
      return this.dialogueActionGenerator.generate({
        characterSkills: input.characterSkills,
        characterKnownFacts: input.characterKnownFacts,
        npc: {
          id: focal?.id ?? input.focalNpcId ?? "unknown",
          name: focal?.name ?? "Interlocutor",
          tags: focal?.tags ?? [],
          knowledgeScope: focal?.knowledgeScope ?? [],
          dialogueWeight: focal?.dialogueWeight ?? "ambient",
        },
      });
    }

    if (input.sceneMode === "open") {
      return this.openModeActionGenerator.generate({
        npcsPresent: input.npcsPresent,
        interactables: input.interactables,
        characterSkills: input.characterSkills,
      });
    }

    return [];
  }

  private async loadProficientSkillSlugs(
    session: GameSessionEntity | null,
    userId?: string,
  ): Promise<string[]> {
    const characterId = session?.characterIds?.[0];
    if (!characterId || !userId) return [];
    const sheet = await this.characterSheetService.computeSheet(userId, characterId);
    return (sheet.skills ?? [])
      .filter((skill) => skill.proficient)
      .map((skill) => skill.slug);
  }

  private extractKnownFacts(sceneNpcs: SceneNpcEntity[]): string[] {
    const publicHooks = sceneNpcs.flatMap((sceneNpc) =>
      (sceneNpc.npc?.tags ?? [])
        .filter((tag) => tag.startsWith("public_hook:"))
        .map((tag) => tag.slice("public_hook:".length)),
    );
    return [...new Set(publicHooks)];
  }

  private async publishPoiMoved(payload: {
    session: GameSessionEntity;
    fromSceneId: string;
    toSceneId: string;
    locationId: string;
    fromPoiId: string | null;
    toPoi: LocationPoiEntity;
    reason: string;
  }): Promise<void> {
    if (!payload.session.campaignId) return;
    try {
      const envelope = this.envelopeFactory.build({
        eventCategory: "WorldEvent",
        eventType: "poi_moved",
        source: {
          service: "diad-backend",
          module: "MoveToPoiService.run",
        },
        scope: {
          campaignId: payload.session.campaignId,
          sessionId: payload.session.id,
          sceneId: payload.toSceneId,
        },
        audiences: ["Director", "Narrator", "HUD"],
        narrativeDescriptor: `Movimento local para ${payload.toPoi.name}.`,
        payload: {
          sessionId: payload.session.id,
          campaignId: payload.session.campaignId,
          fromSceneId: payload.fromSceneId,
          toSceneId: payload.toSceneId,
          locationId: payload.locationId,
          fromPoiId: payload.fromPoiId,
          toPoiId: payload.toPoi.id,
          toPoiName: payload.toPoi.name,
          reason: payload.reason,
        },
      });
      await this.eventBus.publish(envelope);
    } catch (err) {
      this.logger.warn("poi.moved.publish_failed", {
        "session.id": payload.session.id,
        "poi.id": payload.toPoi.id,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }

  private toAvailablePoi(poi: LocationPoiEntity): AvailablePoi {
    return {
      id: poi.id,
      name: poi.name,
      type: poi.type,
      description: poi.description ?? null,
      atmosphere: poi.atmosphere ?? null,
      aliases: poi.aliases ?? [],
      tags: poi.tags ?? [],
      isDefault: poi.isDefault,
      isLocked: poi.isLocked,
      phaseIndex: poi.phaseIndex ?? null,
    };
  }
}
