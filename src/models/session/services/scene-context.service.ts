import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SceneEntity } from "src/entities/scene.entity";
import { SceneNpcEntity } from "src/entities/scene-npc.entity";
import { LocationEntity } from "src/entities/location.entity";
import { LocationPoiEntity } from "src/entities/location-poi.entity";
import { LocationConnectionEntity } from "src/entities/location-connection.entity";
import { CampaignEntity } from "src/entities/campaign.entity";
import {
  GameSessionEntity,
  SessionTravelState,
} from "src/entities/game-session.entity";
import { StoryArcEntity } from "src/entities/story-arc.entity";
import { NpcEntity } from "src/entities/npc.entity";
import { NpcRelationshipEntity } from "src/entities/npc-relationship.entity";
import { QuestEntity } from "src/entities/quest.entity";
import { SessionNpcStateEntity } from "src/entities/session-npc-state.entity";
import { SessionStoryArcStateEntity } from "src/entities/session-story-arc-state.entity";
import { In } from "typeorm";
import { EventLogService } from "./event-log.service";
import { ChronicleService } from "./chronicle.service";
import { SceneContextCacheService } from "./scene-context-cache.service";
import {
  MovementLockService,
  type MovementLockState,
} from "./movement-lock.service";
import { PcPersonaService } from "src/models/characters/services/pc-persona.service";
import { PCPersona } from "src/models/characters/dto/pc-persona.dto";
import type { ColdOpenHookSnapshot } from "src/models/cold-open/domain/opening-archetype.types";


export interface SceneContext {

  scene: {
    id?: string;
    title?: string;
    description?: string;
    mood?: string;
    coldOpenHook?: ColdOpenHookSnapshot | null;
    location?: {
      id?: string;
      name: string;
      type: string;
      description?: string;
      atmosphere?: string;
    };
    poi?: {
      id: string;
      name: string;
      type: string;
      description?: string;
      atmosphere?: string;
    };
  };
  npcsPresent: Array<{

    id: string;
    name: string;
    title?: string;
    race?: string;
    status: "alive" | "dead" | "missing" | "unknown";
    disposition: string;
    presenceRole?: "present" | "interlocutor" | "companion";
    currentPoiId?: string | null;
    personalityBig5: Record<string, number>;
    motivation?: string;
    knowledgeScope: string[];
    dialogueStyle?: string;
  }>;


  recentEvents: Array<{
    eventType: string;
    summary: string;
    sequence: number;
  }>;


  partyKnowledge: Array<{
    entityType: string;
    knowledgeKey: string;
    knowledgeValue?: string;
  }>;


  locationChain: Array<{ name: string; type: string; description?: string }>;
  worldLore?: string;


  recentChronicles: Array<{
    title: string;
    content: string;
    significance: number;
  }>;


  storyArc?: {
    name: string;
    currentPhase: string;
    phaseNotes: Record<string, string>;
  };


  playerCharacter?: PCPersona | null;

  availableLocations: Array<{
    connectionId: string;
    toLocationId: string;
    toLocationName: string;
    toLocationType: string;
    travelTime: string | null;
    description: string | null;
    isLocked: boolean;
  }>;

  availablePois: Array<{
    id: string;
    name: string;
    type: string;
    description?: string | null;
    atmosphere?: string | null;
    aliases: string[];
    tags: string[];
    isDefault: boolean;
    isLocked: boolean;
  }>;

  stage: {
    location?: {
      id: string;
      name: string;
      type: string;
      description?: string;
      atmosphere?: string;
    };
    poi?: {
      id: string;
      name: string;
      type: string;
      description?: string;
      atmosphere?: string;
    };
    availablePois: SceneContext["availablePois"];
    npcsPresent: SceneContext["npcsPresent"];
    nearbyNpcs: Array<{
      id: string;
      name: string;
      title?: string;
      disposition: string;
      status: string;
      currentPoiId?: string | null;
      currentPoiName?: string | null;
    }>;
    currentInterlocutor?: {
      id: string;
      name: string;
      title?: string;
      disposition: string;
    } | null;
    movementLock?: MovementLockState | null;
    mentionedEntities: Array<{
      name: string;
      type?: string;
      status: "mentioned" | "absent" | "unknown";
      source?: string;
    }>;
  };

  travelState?: SessionTravelState | null;
}

@Injectable()
export class SceneContextService {
  constructor(
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    @InjectRepository(SceneNpcEntity)
    private readonly sceneNpcRepo: Repository<SceneNpcEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(LocationPoiEntity)
    private readonly poiRepo: Repository<LocationPoiEntity>,
    @InjectRepository(LocationConnectionEntity)
    private readonly connectionRepo: Repository<LocationConnectionEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(StoryArcEntity)
    private readonly arcRepo: Repository<StoryArcEntity>,
    @InjectRepository(NpcEntity)
    private readonly npcRepo: Repository<NpcEntity>,
    @InjectRepository(NpcRelationshipEntity)
    private readonly relRepo: Repository<NpcRelationshipEntity>,
    @InjectRepository(QuestEntity)
    private readonly questRepo: Repository<QuestEntity>,
    @InjectRepository(SessionNpcStateEntity)
    private readonly npcStateRepo: Repository<SessionNpcStateEntity>,
    @InjectRepository(SessionStoryArcStateEntity)
    private readonly arcStateRepo: Repository<SessionStoryArcStateEntity>,
    private readonly eventLogService: EventLogService,
    private readonly chronicleService: ChronicleService,
    private readonly pcPersonaService: PcPersonaService,
    private readonly cache: SceneContextCacheService,
    private readonly movementLockService: MovementLockService,
  ) {}

  async assembleContext(sceneId: string): Promise<SceneContext> {
    const cached = this.cache.get(sceneId);
    if (cached) return cached;
    const ctx = await this.assembleContextUncached(sceneId);
    this.cache.set(sceneId, ctx);
    return ctx;
  }

  private async assembleContextUncached(
    sceneId: string,
  ): Promise<SceneContext> {

    const scene = await this.sceneRepo.findOne({
      where: { id: sceneId },
      relations: ["location", "session", "poi", "currentInterlocutorNpc"],
    });
    if (!scene) {
      return this.emptyContext();
    }

    const sessionId = scene.sessionId;
    const locationId = scene.locationId;
    const campaignId = scene.location?.campaignId;


    const [
      session,
      sceneNpcs,
      events,
      campaign,
      chroniclesRaw,
      arc,
      connections,
      availablePoisRaw,
      nearbyNpcStatesRaw,
      locationChain,
    ] = await Promise.all([
      this.sessionRepo.findOne({ where: { id: sessionId } }),
      this.sceneNpcRepo.find({
        where: { sceneId },
        relations: ["npc"],
      }),
      this.eventLogService.getRecentEvents(sessionId, 25),
      campaignId
        ? this.campaignRepo.findOne({ where: { id: campaignId } })
        : Promise.resolve(null),
      campaignId
        ? this.chronicleService.getChronicles(campaignId, 5, 3)
        : Promise.resolve([]),
      campaignId
        ? this.arcRepo.findOne({
            where: { campaignId, isActive: true, isMainArc: true },
          })
        : Promise.resolve(null),
      locationId
        ? this.connectionRepo.find({
            where: { fromLocationId: locationId, isHidden: false },
            relations: ["toLocation"],
          })
        : Promise.resolve([]),
      locationId
        ? this.poiRepo.find({
            where: { locationId, isKnownToParty: true },
            order: { sortOrder: "ASC", name: "ASC" },
          })
        : Promise.resolve([]),
      locationId
        ? this.npcStateRepo.find({
            where: { gameSessionId: sessionId, currentLocationId: locationId },
            relations: ["npc", "currentPoi"],
          })
        : Promise.resolve([]),
      this.getLocationChain(locationId),
    ]);

    const presentNpcIds = sceneNpcs
      .filter((sn) => sn.npc)
      .map((sn) => sn.npc.id);
    const allSceneNpcIds = sceneNpcs.map((sn) => sn.npcId);
    const characterIds = session?.characterIds ?? [];


    const [npcStates, partyKnowledgeRaw, arcState, playerCharacter] =
      await Promise.all([
        presentNpcIds.length > 0
          ? this.npcStateRepo.find({
              where: { gameSessionId: sessionId, npcId: In(presentNpcIds) },
              relations: ["currentPoi"],
            })
          : Promise.resolve([]),
        campaignId
          ? this.chronicleService.getRelevantKnowledge(campaignId, {
              locationId,
              npcIds: allSceneNpcIds,
            })
          : Promise.resolve([]),
        arc
          ? this.arcStateRepo.findOne({
              where: { gameSessionId: sessionId, storyArcId: arc.id },
            })
          : Promise.resolve(null),
        characterIds.length === 1
          ? this.pcPersonaService
              .assemblePersona(characterIds[0], null)
              .catch(() => null as PCPersona | null)
          : Promise.resolve<PCPersona | null>(null),
      ]);

    const dispositionByNpc = new Map(
      npcStates.map((s) => [s.npcId, s.disposition]),
    );
    const statusByNpc = new Map(npcStates.map((s) => [s.npcId, s.status]));
    const currentPoiByNpc = new Map(
      npcStates.map((s) => [s.npcId, s.currentPoiId ?? null]),
    );

    const npcsPresent = sceneNpcs
      .filter((sn) => sn.npc)
      .filter((sn) => (statusByNpc.get(sn.npc.id) ?? "alive") !== "dead")
      .map((sn) => ({
        id: sn.npc.id,
        name: sn.npc.name,
        title: sn.npc.title,
        race: sn.npc.race,
        status: statusByNpc.get(sn.npc.id) ?? "alive",
        disposition: dispositionByNpc.get(sn.npc.id) ?? "neutral",
        presenceRole: sn.presenceRole,
        currentPoiId: currentPoiByNpc.get(sn.npc.id) ?? scene.poiId ?? null,
        personalityBig5: sn.npc.personalityBig5 as Record<string, number>,
        motivation: sn.npc.motivation,
        knowledgeScope: sn.npc.knowledgeScope,
        dialogueStyle: sn.npc.dialogueStyle,
      }));

    const recentEvents = events.reverse().map((e) => ({
      eventType: e.eventType,
      summary: e.summary,
      sequence: e.sequence,
    }));

    const partyKnowledge: SceneContext["partyKnowledge"] =
      partyKnowledgeRaw.map((k) => ({
        entityType: k.entityType,
        knowledgeKey: k.knowledgeKey,
        knowledgeValue: k.knowledgeValue,
      }));

    const worldLore: string | undefined = campaign?.worldLore ?? undefined;

    const recentChronicles: SceneContext["recentChronicles"] =
      chroniclesRaw.map((c) => ({
        title: c.title,
        content: c.content,
        significance: c.significance,
      }));

    let storyArc: SceneContext["storyArc"];
    if (arc) {
      storyArc = {
        name: arc.name,
        currentPhase: arcState?.currentPhase ?? "hook",
        phaseNotes: arcState?.phaseNotes ?? {},
      };
    }

    const availableLocations: SceneContext["availableLocations"] =
      connections.map((c) => ({
        connectionId: c.id,
        toLocationId: c.toLocationId,
        toLocationName: c.toLocation?.name ?? "(?)",
        toLocationType: c.toLocation?.type ?? "unknown",
        travelTime: c.travelTime ?? null,
        description: c.description ?? null,
        isLocked: c.isLocked,
      }));

    const availablePois: SceneContext["availablePois"] = availablePoisRaw
      .filter((poi) => poi.isKnownToParty)
      .map((poi) => ({
        id: poi.id,
        name: poi.name,
        type: poi.type,
        description: poi.description ?? null,
        atmosphere: poi.atmosphere ?? null,
        aliases: poi.aliases ?? [],
        tags: poi.tags ?? [],
        isDefault: poi.isDefault,
        isLocked: poi.isLocked,
      }));

    const currentInterlocutorNpc =
      [
        scene.currentInterlocutorNpc,
        ...sceneNpcs
          .filter((sn) => sn.presenceRole === "interlocutor")
          .map((sn) => sn.npc),
      ].find((npc) => npc && (statusByNpc.get(npc.id) ?? "alive") !== "dead") ??
      null;
    const currentInterlocutor = currentInterlocutorNpc
      ? {
          id: currentInterlocutorNpc.id,
          name: currentInterlocutorNpc.name,
          title: currentInterlocutorNpc.title,
          disposition:
            dispositionByNpc.get(currentInterlocutorNpc.id) ?? "neutral",
        }
      : null;

    const presentNpcSet = new Set(presentNpcIds);
    const nearbyNpcs: SceneContext["stage"]["nearbyNpcs"] = nearbyNpcStatesRaw
      .filter((state) => state.npc)
      .filter((state) => !presentNpcSet.has(state.npcId))
      .filter((state) => state.status !== "dead")
      .map((state) => ({
        id: state.npc.id,
        name: state.npc.name,
        title: state.npc.title,
        disposition: state.disposition,
        status: state.status,
        currentPoiId: state.currentPoiId ?? null,
        currentPoiName: state.currentPoi?.name ?? null,
      }));

    const stage: SceneContext["stage"] = {
      location: scene.location
        ? {
            id: scene.location.id,
            name: scene.location.name,
            type: scene.location.type,
            description: scene.location.description,
            atmosphere: scene.location.atmosphere,
          }
        : undefined,
      poi: scene.poi
        ? {
            id: scene.poi.id,
            name: scene.poi.name,
            type: scene.poi.type,
            description: scene.poi.description,
            atmosphere: scene.poi.atmosphere,
          }
        : undefined,
      availablePois,
      npcsPresent,
      nearbyNpcs,
      currentInterlocutor,
      movementLock: this.movementLockService.getForScene(scene),
      mentionedEntities: [],
    };

    const travelState = session?.travelState ?? null;

    return {
      scene: {
        id: scene.id,
        title: scene.title,
        description: scene.description,
        mood: scene.mood,
        coldOpenHook: scene.coldOpenHook ?? null,
        location: scene.location
          ? {
              id: scene.location.id,
              name: scene.location.name,
              type: scene.location.type,
              description: scene.location.description,
              atmosphere: scene.location.atmosphere,
            }
          : undefined,
        poi: scene.poi
          ? {
              id: scene.poi.id,
              name: scene.poi.name,
              type: scene.poi.type,
              description: scene.poi.description,
              atmosphere: scene.poi.atmosphere,
            }
          : undefined,
      },
      npcsPresent,
      recentEvents,
      partyKnowledge,
      locationChain,
      worldLore,
      recentChronicles,
      storyArc,
      playerCharacter,
      availableLocations,
      availablePois,
      stage,
      travelState,
    };
  }

  private async getLocationChain(
    locationId?: string,
  ): Promise<Array<{ name: string; type: string; description?: string }>> {
    if (!locationId) return [];



    const rows: Array<{
      name: string;
      type: string;
      description: string | null;
      depth: number;
    }> = await this.locationRepo.query(
      `WITH RECURSIVE chain AS (
         SELECT id, parent_id, name, type, description, 0 AS depth
         FROM locations WHERE id = $1
         UNION ALL
         SELECT l.id, l.parent_id, l.name, l.type, l.description, c.depth + 1
         FROM locations l
         JOIN chain c ON l.id = c.parent_id
       )
       SELECT name, type, description, depth FROM chain ORDER BY depth DESC`,
      [locationId],
    );

    return rows.map((r) => ({
      name: r.name,
      type: r.type,
      description: r.description ?? undefined,
    }));
  }

  private emptyContext(): SceneContext {
    return {
      scene: {},
      npcsPresent: [],
      recentEvents: [],
      partyKnowledge: [],
      locationChain: [],
      recentChronicles: [],
      playerCharacter: null,
      availableLocations: [],
      availablePois: [],
      stage: {
        availablePois: [],
        npcsPresent: [],
        nearbyNpcs: [],
        currentInterlocutor: null,
        movementLock: null,
        mentionedEntities: [],
      },
      travelState: null,
    };
  }
}
