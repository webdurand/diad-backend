import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SceneEntity } from 'src/entities/scene.entity';
import { SceneNpcEntity } from 'src/entities/scene-npc.entity';
import { LocationEntity } from 'src/entities/location.entity';
import { CampaignEntity } from 'src/entities/campaign.entity';
import { GameSessionEntity } from 'src/entities/game-session.entity';
import { StoryArcEntity } from 'src/entities/story-arc.entity';
import { NpcEntity } from 'src/entities/npc.entity';
import { NpcRelationshipEntity } from 'src/entities/npc-relationship.entity';
import { QuestEntity } from 'src/entities/quest.entity';
import { EventLogService } from './event-log.service';
import { ChronicleService } from './chronicle.service';

/**
 * Assembles the 5-tier context for AI integration.
 * This is the single entry point the AI Narrator will call.
 */
export interface SceneContext {
  // Tier 1: Current scene
  scene: {
    title?: string;
    description?: string;
    mood?: string;
    location?: {
      name: string;
      type: string;
      description?: string;
      atmosphere?: string;
    };
  };
  npcsPresent: Array<{
    name: string;
    title?: string;
    race?: string;
    disposition: string;
    personalityBig5: Record<string, number>;
    motivation?: string;
    knowledgeScope: string[];
    dialogueStyle?: string;
  }>;

  // Tier 2: Recent session events
  recentEvents: Array<{
    eventType: string;
    summary: string;
    sequence: number;
  }>;

  // Tier 3: Party knowledge (filtered by relevance)
  partyKnowledge: Array<{
    entityType: string;
    knowledgeKey: string;
    knowledgeValue?: string;
  }>;

  // Tier 4: World lore
  locationChain: Array<{ name: string; type: string; description?: string }>;
  worldLore?: string;

  // Tier 5: Chronicle
  recentChronicles: Array<{
    title: string;
    content: string;
    significance: number;
  }>;

  // Story arc pacing
  storyArc?: {
    name: string;
    currentPhase: string;
    phaseNotes: Record<string, string>;
  };
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
    private readonly eventLogService: EventLogService,
    private readonly chronicleService: ChronicleService,
  ) {}

  async assembleContext(sceneId: string): Promise<SceneContext> {
    const scene = await this.sceneRepo.findOne({
      where: { id: sceneId },
      relations: ['location', 'session'],
    });
    if (!scene) {
      return this.emptyContext();
    }

    const session = await this.sessionRepo.findOne({
      where: { id: scene.sessionId },
    });

    // We need the campaignId — for now get it from session config or location
    // In V1 sessions aren't tied to campaigns yet. Return what we can.
    const campaignId = scene.location?.campaignId;

    // Tier 1: Scene + NPCs
    const sceneNpcs = await this.sceneNpcRepo.find({
      where: { sceneId },
      relations: ['npc'],
    });

    const npcsPresent = sceneNpcs
      .filter((sn) => sn.npc)
      .map((sn) => ({
        name: sn.npc.name,
        title: sn.npc.title,
        race: sn.npc.race,
        disposition: sn.npc.disposition,
        personalityBig5: sn.npc.personalityBig5 as Record<string, number>,
        motivation: sn.npc.motivation,
        knowledgeScope: sn.npc.knowledgeScope,
        dialogueStyle: sn.npc.dialogueStyle,
      }));

    // Tier 2: Recent events
    const events = await this.eventLogService.getRecentEvents(
      scene.sessionId,
      25,
    );
    const recentEvents = events.reverse().map((e) => ({
      eventType: e.eventType,
      summary: e.summary,
      sequence: e.sequence,
    }));

    // Tier 3: Party knowledge
    let partyKnowledge: SceneContext['partyKnowledge'] = [];
    if (campaignId) {
      const npcIds = sceneNpcs.map((sn) => sn.npcId);
      const knowledge = await this.chronicleService.getRelevantKnowledge(
        campaignId,
        { locationId: scene.locationId, npcIds },
      );
      partyKnowledge = knowledge.map((k) => ({
        entityType: k.entityType,
        knowledgeKey: k.knowledgeKey,
        knowledgeValue: k.knowledgeValue,
      }));
    }

    // Tier 4: Location chain + world lore
    const locationChain = await this.getLocationChain(scene.locationId);
    let worldLore: string | undefined;
    if (campaignId) {
      const campaign = await this.campaignRepo.findOne({
        where: { id: campaignId },
      });
      worldLore = campaign?.worldLore ?? undefined;
    }

    // Tier 5: Chronicles
    let recentChronicles: SceneContext['recentChronicles'] = [];
    if (campaignId) {
      const chronicles = await this.chronicleService.getChronicles(
        campaignId,
        5,
        3,
      );
      recentChronicles = chronicles.map((c) => ({
        title: c.title,
        content: c.content,
        significance: c.significance,
      }));
    }

    // Story arc
    let storyArc: SceneContext['storyArc'];
    if (campaignId) {
      const arc = await this.arcRepo.findOne({
        where: { campaignId, isActive: true, isMainArc: true },
      });
      if (arc) {
        storyArc = {
          name: arc.name,
          currentPhase: arc.currentPhase,
          phaseNotes: arc.phaseNotes,
        };
      }
    }

    return {
      scene: {
        title: scene.title,
        description: scene.description,
        mood: scene.mood,
        location: scene.location
          ? {
              name: scene.location.name,
              type: scene.location.type,
              description: scene.location.description,
              atmosphere: scene.location.atmosphere,
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
    };
  }

  private async getLocationChain(
    locationId?: string,
  ): Promise<Array<{ name: string; type: string; description?: string }>> {
    if (!locationId) return [];

    const chain: Array<{ name: string; type: string; description?: string }> = [];
    let currentId: string | undefined = locationId;

    while (currentId) {
      const loc = await this.locationRepo.findOne({
        where: { id: currentId },
      });
      if (!loc) break;
      chain.unshift({
        name: loc.name,
        type: loc.type,
        description: loc.description,
      });
      currentId = loc.parentId;
    }

    return chain;
  }

  private emptyContext(): SceneContext {
    return {
      scene: {},
      npcsPresent: [],
      recentEvents: [],
      partyKnowledge: [],
      locationChain: [],
      recentChronicles: [],
    };
  }
}
