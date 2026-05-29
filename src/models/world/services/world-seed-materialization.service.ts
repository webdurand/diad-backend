import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { DataSource, EntityManager, In, IsNull } from "typeorm";
import {
  CampaignEntity,
  ClockEntity,
  FactionEntity,
  LocationConnectionEntity,
  LocationEntity,
  LocationPoiEntity,
  LoreEntryEntity,
  NpcArchetypeTemplateEntity,
  NpcEntity,
  NpcRelationshipEntity,
  NpcStoryHookEntity,
  StoryArcEntity,
} from "src/entities";
import type { ClockAdvanceRules, ClockOnFullAction } from "src/entities/clock.entity";
import type { LoreEntryEntityType } from "src/entities/lore-entry.entity";
import type {
  NpcStoryHookRelatedEntityType,
  NpcStoryHookType,
} from "src/entities/npc-story-hook.entity";
import type { NpcRoutineSlots } from "src/lib/routine-slot";

type JsonObject = Record<string, unknown>;

export interface WorldSeedMaterializeBody {
  generationSeed?: JsonObject;
  context?: WorldSeedContext;
  additions?: WorldCompletionAdditions;
  connections?: LocationConnectionSeed[];
  clocks?: ClockSeed[];
  storyArc?: StoryArcSeed | null;
  quests?: QuestSeed[];
  startingLocationName?: string | null;
  contentBudget?: {
    maxScenes?: number;
    maxNpcs?: number;
    maxLocations?: number;
  };
  tonalAnchor?: JsonObject;
  chaosFactor?: number;
  centralQuestion?: string;
  publish?: boolean;
}

export interface WorldSeedContext {
  name?: string;
  description?: string;
  world_lore?: string;
  tonal_anchor?: JsonObject;
  voice_profile?: string;
  npcs?: NpcSeed[];
  locations?: LocationSeed[];
  factions?: FactionSeed[];
  lore_entries?: LoreSeed[];
}

export interface WorldCompletionAdditions {
  npcs?: NpcSeed[];
  locations?: LocationSeed[];
  factions?: FactionSeed[];
  lore_entries?: LoreSeed[];
  clocks?: ClockSeed[];
  story_arc?: StoryArcSeed;
  quests?: QuestSeed[];
}

interface NpcSeed {
  name?: string | null;
  title?: string;
  race?: string;
  role?: string;
  profile_depth?: "core" | "supporting" | "expanded";
  archetype_slug?: string;
  faction_slug?: string | null;
  location_name?: string | null;
  homeLocationId?: string | null;
  homePoiId?: string | null;
  routineSlots?: NpcRoutineSlots | null;
  personality_big5?: Record<string, number>;
  motivation?: string;
  knowledge_scope?: string[];
  dialogue_style?: string;
  voice_notes?: string;
  description?: string;
  description_hidden?: string;
  reputation_seed?: { tags?: string[] };
  relationships?: NpcRelationshipSeed[];
  story_hooks?: NpcStoryHookSeed[];
}

interface NpcRelationshipSeed {
  target_name?: string;
  type?: string;
  relationshipType?: string;
  description?: string;
  strength?: number;
  isKnownToParty?: boolean;
}

interface NpcStoryHookSeed {
  hook_type?: string;
  hookType?: string;
  title?: string;
  description?: string;
  related_entity_type?: string;
  relatedEntityType?: string;
  related_entity_id?: string;
  relatedEntityId?: string;
  related_entity_name?: string;
  relatedEntityName?: string;
  isKnownToParty?: boolean;
  priority?: number;
  metadata?: JsonObject;
}

interface LocationSeed {
  name?: string | null;
  type?: string;
  parent_name?: string | null;
  parentId?: string | null;
  description?: string;
  description_hidden?: string;
  atmosphere?: string;
  tags?: string[];
  properties?: JsonObject;
  pois?: PoiSeed[];
}

interface PoiSeed {
  name?: string | null;
  type?: string;
  description?: string;
  atmosphere?: string;
  aliases?: string[];
  tags?: string[];
  isDefault?: boolean;
  isSecret?: boolean;
  isKnownToParty?: boolean;
  isLocked?: boolean;
  sortOrder?: number;
  properties?: JsonObject;
}

interface LocationConnectionSeed {
  from_name?: string;
  to_name?: string;
  travel_hours?: number;
  description?: string | null;
  is_hidden?: boolean;
  toLocationId?: string;
  travelTime?: string;
  isHidden?: boolean;
  isLocked?: boolean;
}

interface FactionSeed {
  name?: string | null;
  slug?: string;
  description?: string;
  goals?: string[];
  alignment?: string;
  influenceLevel?: number;
  headquartersLocationName?: string | null;
  headquartersLocationId?: string | null;
  tags?: string[];
}

interface LoreSeed {
  title?: string;
  name?: string;
  body?: string;
  description?: string;
  activationKeys?: string[];
  category?: string;
  entityType?: string;
}

interface ClockSeed {
  name?: string | null;
  segments?: number;
  filled?: number;
  type?: string;
  visibleToPlayer?: boolean;
  onFullAction?: ClockOnFullAction;
  advanceRules?: ClockAdvanceRules;
  expiresAt?: string;
}

interface StoryArcSeed {
  name?: string | null;
  description?: string;
  premise?: string;
  hook?: string;
  development?: string;
  climax?: string;
  resolution?: string;
  phaseNotes?: {
    hook?: string;
    development?: string;
    climax?: string;
    resolution?: string;
  };
  sortOrder?: number;
  isMainArc?: boolean;
  isActive?: boolean;
}

interface QuestSeed {
  name?: string | null;
  description?: string;
  objectives?: unknown[];
}

interface MaterializedContent {
  locations: LocationSeed[];
  factions: FactionSeed[];
  npcs: NpcSeed[];
  loreEntries: LoreSeed[];
  connections: LocationConnectionSeed[];
  clocks: ClockSeed[];
  storyArc: StoryArcSeed | null;
  quests: QuestSeed[];
}

interface MaterializeStats {
  locations: number;
  connections: number;
  factions: number;
  npcs: number;
  loreEntries: number;
  clocks: number;
  storyArcs: number;
  quests: number;
  npcRelationships: number;
  npcStoryHooks: number;
}

@Injectable()
export class WorldSeedMaterializationService {
  private readonly logger = new Logger(WorldSeedMaterializationService.name);

  constructor(private readonly dataSource: DataSource) {}

  async materialize(
    campaignId: string,
    body: WorldSeedMaterializeBody,
  ): Promise<CampaignEntity> {
    const startedAt = Date.now();
    const content = this.extractContent(body);
    const stats = this.emptyStats(content);

    this.logger.log(
      `world_seed.materialize.start campaignId=${campaignId} planned=${JSON.stringify(
        stats,
      )}`,
    );

    const campaign = await this.dataSource.transaction(async (manager) => {
      const campaignRepo = manager.getRepository(CampaignEntity);
      const campaign = await campaignRepo.findOne({ where: { id: campaignId } });
      if (!campaign) throw new NotFoundException("Campanha nao encontrada.");

      this.applyCampaignMetadata(campaign, body, content);

      const locations = await this.persistLocations(
        manager,
        campaign.id,
        content.locations,
      );
      stats.locations = locations.size;
      const poisByLocation = await this.listPoisByLocation(
        manager,
        campaign.id,
        locations,
      );

      stats.connections = await this.persistConnections(
        manager,
        content.connections,
        locations,
      );

      const factions = await this.persistFactions(
        manager,
        campaign.id,
        content.factions,
        locations,
      );
      stats.factions = factions.size;

      const npcs = await this.persistNpcs(
        manager,
        campaign.id,
        content.npcs,
        locations,
        body.startingLocationName,
        poisByLocation,
        campaign.contentBudget?.maxNpcs,
      );
      stats.npcs = npcs.size;

      const loreEntries = await this.persistLoreEntries(
        manager,
        campaign.id,
        content.loreEntries,
      );
      stats.loreEntries = loreEntries.size;

      stats.clocks = await this.persistClocks(manager, campaign.id, content.clocks);
      stats.storyArcs = await this.persistStoryArc(
        manager,
        campaign.id,
        content.storyArc,
      );
      stats.quests = content.quests.length;

      if (content.quests.length > 0) {
        const seed = { ...(campaign.generationSeed ?? {}) };
        seed.questsTemplate = content.quests;
        campaign.generationSeed = seed;
      }

      const relationshipStats = await this.persistNpcNarrativeLinks(
        manager,
        content.npcs,
        npcs,
        factions,
        locations,
        loreEntries,
      );
      stats.npcRelationships = relationshipStats.relationships;
      stats.npcStoryHooks = relationshipStats.storyHooks;

      const startingLocation = this.resolveStartingLocation(
        locations,
        body.startingLocationName,
      );
      if (startingLocation) {
        campaign.startingLocationId = startingLocation.id;
      }

      if (body.publish) {
        campaign.isDraft = false;
      }

      return campaignRepo.save(campaign);
    });

    this.logger.log(
      `world_seed.materialize.done campaignId=${campaignId} durationMs=${
        Date.now() - startedAt
      } saved=${JSON.stringify(stats)}`,
    );

    return campaign;
  }

  private extractContent(body: WorldSeedMaterializeBody): MaterializedContent {
    const context = body.context ?? {};
    const additions = body.additions ?? {};
    return {
      locations: this.uniqueByName([
        ...asArray(context.locations),
        ...asArray(additions.locations),
      ]),
      factions: this.uniqueByName([
        ...asArray(context.factions),
        ...asArray(additions.factions),
      ]),
      npcs: this.uniqueByName([
        ...asArray(context.npcs),
        ...asArray(additions.npcs),
      ]),
      loreEntries: this.uniqueLore([
        ...asArray(context.lore_entries),
        ...asArray(additions.lore_entries),
      ]),
      connections: asArray(body.connections),
      clocks: this.uniqueByName([
        ...asArray(body.clocks),
        ...asArray(additions.clocks),
      ]),
      storyArc: body.storyArc ?? additions.story_arc ?? null,
      quests: this.uniqueByName([
        ...asArray(body.quests),
        ...asArray(additions.quests),
      ]),
    };
  }

  private emptyStats(content: MaterializedContent): MaterializeStats {
    return {
      locations: content.locations.length,
      connections: content.connections.length,
      factions: content.factions.length,
      npcs: content.npcs.length,
      loreEntries: content.loreEntries.length,
      clocks: content.clocks.length,
      storyArcs: content.storyArc ? 1 : 0,
      quests: content.quests.length,
      npcRelationships: 0,
      npcStoryHooks: 0,
    };
  }

  private applyCampaignMetadata(
    campaign: CampaignEntity,
    body: WorldSeedMaterializeBody,
    content: MaterializedContent,
  ): void {
    if (body.generationSeed) {
      campaign.generationSeed = { ...body.generationSeed };
    }
    if (body.contentBudget) {
      campaign.contentBudget = {
        maxScenes: body.contentBudget.maxScenes ?? campaign.contentBudget.maxScenes,
        maxNpcs:
          body.contentBudget.maxNpcs ??
          campaign.contentBudget.maxNpcs ??
          Math.max(12, content.npcs.length),
        maxLocations:
          body.contentBudget.maxLocations ??
          campaign.contentBudget.maxLocations ??
          Math.max(6, content.locations.length),
      };
    }
    const tonalAnchor = body.tonalAnchor ?? body.context?.tonal_anchor;
    if (tonalAnchor) campaign.tonalAnchor = tonalAnchor;
    if (body.centralQuestion !== undefined) {
      campaign.centralQuestion = body.centralQuestion;
      if (body.centralQuestion && !campaign.questionStatedAtScene) {
        campaign.questionStatedAtScene = 1;
      }
    }
  }

  private async persistLocations(
    manager: EntityManager,
    campaignId: string,
    seeds: LocationSeed[],
  ): Promise<Map<string, LocationEntity>> {
    const repo = manager.getRepository(LocationEntity);
    const existing = await repo.find({ where: { campaignId } });
    const byName = this.mapByName(existing);

    for (const seed of seeds) {
      const name = clean(seed.name);
      if (!name) continue;

      const key = normalizeKey(name);
      let location = byName.get(key);
      if (location) {
        location.type = clean(seed.type) || location.type || "region";
        location.description = clean(seed.description) || location.description;
        location.descriptionHidden =
          clean(seed.description_hidden) || location.descriptionHidden;
        location.atmosphere = clean(seed.atmosphere) || location.atmosphere;
        location.tags = seed.tags ?? location.tags ?? [];
        location.properties = {
          ...(location.properties ?? {}),
          ...(seed.properties ?? {}),
        };
      } else {
        location = repo.create({
          campaignId,
          slug: this.generateSlug(name),
          name,
          type: clean(seed.type) || "region",
          description: clean(seed.description) || undefined,
          descriptionHidden: clean(seed.description_hidden) || undefined,
          atmosphere: clean(seed.atmosphere) || undefined,
          tags: seed.tags ?? [],
          properties: seed.properties ?? {},
        });
      }

      const saved = await repo.save(location);
      byName.set(key, saved);
      await this.ensureLocationPois(manager, campaignId, saved, seed.pois ?? []);
    }

    for (const seed of seeds) {
      const location = byName.get(normalizeKey(seed.name));
      if (!location) continue;
      const parentId = clean(seed.parentId);
      const parentName = clean(seed.parent_name);
      const parent =
        (parentId
          ? Array.from(byName.values()).find((candidate) => candidate.id === parentId)
          : undefined) ?? (parentName ? byName.get(normalizeKey(parentName)) : undefined);
      if (parent && parent.id !== location.id && location.parentId !== parent.id) {
        location.parentId = parent.id;
        await repo.save(location);
      }
    }

    return byName;
  }

  private async ensureLocationPois(
    manager: EntityManager,
    campaignId: string,
    location: LocationEntity,
    seeds: PoiSeed[],
  ): Promise<void> {
    const repo = manager.getRepository(LocationPoiEntity);
    const existing = await repo.find({
      where: { campaignId, locationId: location.id },
      order: { sortOrder: "ASC", name: "ASC" },
    });
    const byName = this.mapByName(existing);
    let hasDefault = existing.some((poi) => poi.isDefault);

    for (const [index, seed] of seeds.entries()) {
      const name = clean(seed.name);
      if (!name) continue;

      const key = normalizeKey(name);
      const isSecret = seed.isSecret ?? false;
      const isDefault = seed.isDefault ?? (!hasDefault && !isSecret);
      if (isDefault) {
        await repo.update(
          { campaignId, locationId: location.id, isDefault: true },
          { isDefault: false },
        );
        hasDefault = true;
      }

      const existingPoi = byName.get(key);
      const poi =
        existingPoi ??
        repo.create({
          campaignId,
          locationId: location.id,
          slug: this.generateSlug(name),
        });
      poi.name = name;
      poi.type = clean(seed.type) || poi.type || "area";
      poi.description = clean(seed.description) || poi.description;
      poi.atmosphere = clean(seed.atmosphere) || poi.atmosphere;
      poi.aliases = seed.aliases ?? poi.aliases ?? [];
      poi.tags = seed.tags ?? poi.tags ?? [];
      poi.isDefault = isDefault;
      poi.isSecret = isSecret;
      poi.isKnownToParty = seed.isKnownToParty ?? !isSecret;
      poi.isLocked = seed.isLocked ?? false;
      // Spec 047: o default de `kind` no banco é "wild" — sem kind explícito todo
      // POI nasce "wild" e os filtros de residente (`kind !== "wild"`) rejeitam
      // todos → NPCs ficam sem home_poi_id e a cena nasce vazia. Derivamos um kind
      // sensato: POIs acessíveis em locais civilizados viram "safe" (residentes
      // moram lá); locais selvagens/dungeon e POIs secretos/trancados ficam "wild"
      // (preserva encontros aleatórios). Um kind já significativo é mantido.
      poi.kind = this.derivePoiKind(location, poi);
      poi.sortOrder = seed.sortOrder ?? index;
      poi.properties = seed.properties ?? poi.properties ?? {};

      const saved = await repo.save(poi);
      byName.set(key, saved);
    }

    if (!hasDefault) {
      const firstKnown = Array.from(byName.values()).find(
        (poi) => poi.isKnownToParty && !poi.isLocked,
      );
      if (firstKnown) {
        await repo.update(
          { campaignId, locationId: location.id, isDefault: true },
          { isDefault: false },
        );
        firstKnown.isDefault = true;
        firstKnown.isSecret = false;
        firstKnown.isKnownToParty = true;
        if (firstKnown.kind === "wild") firstKnown.kind = "safe";
        await repo.save(firstKnown);
        return;
      }

      await repo.save(
        repo.create({
          campaignId,
          locationId: location.id,
          name: "Area principal",
          slug: this.generateSlug("Area principal"),
          type: "area",
          kind: "safe",
          isDefault: true,
          isKnownToParty: true,
          sortOrder: -1000,
        }),
      );
    }
  }

  private async listPoisByLocation(
    manager: EntityManager,
    campaignId: string,
    locations: Map<string, LocationEntity>,
  ): Promise<Map<string, LocationPoiEntity[]>> {
    const locationIds = uniqueStrings(
      Array.from(locations.values())
        .map((location) => location.id)
        .filter(Boolean),
    );
    if (locationIds.length === 0) return new Map();

    const repo = manager.getRepository(LocationPoiEntity);
    const pois = await repo.find({
      where: { campaignId, locationId: In(locationIds) },
      order: { locationId: "ASC", sortOrder: "ASC", name: "ASC" },
    });

    const byLocation = new Map<string, LocationPoiEntity[]>();
    for (const poi of pois) {
      const current = byLocation.get(poi.locationId) ?? [];
      current.push(poi);
      byLocation.set(poi.locationId, current);
    }
    return byLocation;
  }

  private async persistConnections(
    manager: EntityManager,
    seeds: LocationConnectionSeed[],
    locations: Map<string, LocationEntity>,
  ): Promise<number> {
    const repo = manager.getRepository(LocationConnectionEntity);
    let savedCount = 0;

    for (const seed of seeds) {
      const from = locations.get(normalizeKey(seed.from_name));
      const to =
        (seed.toLocationId
          ? Array.from(locations.values()).find(
              (location) => location.id === seed.toLocationId,
            )
          : undefined) ?? locations.get(normalizeKey(seed.to_name));
      if (!from || !to || from.id === to.id) continue;

      let connection = await repo.findOne({
        where: { fromLocationId: from.id, toLocationId: to.id },
      });
      if (!connection) {
        connection = repo.create({
          fromLocationId: from.id,
          toLocationId: to.id,
        });
      }
      connection.description = clean(seed.description) || connection.description;
      connection.travelTime =
        clean(seed.travelTime) || `${clamp(seed.travel_hours, 1, 72, 4)}h`;
      connection.isHidden = seed.isHidden ?? seed.is_hidden ?? false;
      connection.isLocked = seed.isLocked ?? false;
      connection.requirements = connection.requirements ?? {};
      await repo.save(connection);
      savedCount += 1;
    }

    return savedCount;
  }

  private async persistFactions(
    manager: EntityManager,
    campaignId: string,
    seeds: FactionSeed[],
    locations: Map<string, LocationEntity>,
  ): Promise<Map<string, FactionEntity>> {
    const repo = manager.getRepository(FactionEntity);
    const byName = this.mapByName(await repo.find({ where: { campaignId } }));

    for (const seed of seeds) {
      const name = clean(seed.name);
      if (!name) continue;

      const key = normalizeKey(name);
      const headquarters =
        (seed.headquartersLocationId
          ? Array.from(locations.values()).find(
              (location) => location.id === seed.headquartersLocationId,
            )
          : undefined) ??
        (seed.headquartersLocationName
          ? locations.get(normalizeKey(seed.headquartersLocationName))
          : undefined);

      const faction =
        byName.get(key) ??
        repo.create({
          campaignId,
          slug: clean(seed.slug) || this.generateSlug(name),
          name,
        });
      faction.description = clean(seed.description) || faction.description;
      faction.goals = seed.goals ?? faction.goals ?? [];
      faction.alignment = clean(seed.alignment) || faction.alignment;
      faction.influenceLevel = seed.influenceLevel ?? faction.influenceLevel ?? 5;
      faction.headquartersLocationId = headquarters?.id ?? faction.headquartersLocationId;
      faction.tags = seed.tags ?? faction.tags ?? [];
      const saved = await repo.save(faction);
      byName.set(key, saved);
      if (saved.slug) byName.set(normalizeKey(saved.slug), saved);
      if (seed.slug) byName.set(normalizeKey(seed.slug), saved);
    }

    return byName;
  }

  private async persistNpcs(
    manager: EntityManager,
    campaignId: string,
    seeds: NpcSeed[],
    locations: Map<string, LocationEntity>,
    startingLocationName?: string | null,
    poisByLocation: Map<string, LocationPoiEntity[]> = new Map(),
    maxNpcs?: number,
  ): Promise<Map<string, NpcEntity>> {
    const repo = manager.getRepository(NpcEntity);
    const byName = this.mapByName(await repo.find({ where: { campaignId } }));
    const fallbackLocation = this.resolveStartingLocation(locations, startingLocationName);
    const archetypes = manager.getRepository(NpcArchetypeTemplateEntity);
    const allocatedSeeds = this.allocateNpcsByPoiKind(
      seeds,
      locations,
      fallbackLocation,
      poisByLocation,
      maxNpcs,
    );

    for (const [index, seed] of allocatedSeeds.entries()) {
      const name = clean(seed.name);
      if (!name) continue;

      const key = normalizeKey(name);
      const homeLocation =
        (seed.homeLocationId
          ? Array.from(locations.values()).find(
              (location) => location.id === seed.homeLocationId,
            )
          : undefined) ??
        (seed.location_name ? locations.get(normalizeKey(seed.location_name)) : undefined) ??
        fallbackLocation;

      let monsterId: string | undefined;
      const archetypeSlug = clean(seed.archetype_slug);
      if (archetypeSlug) {
        const template = await archetypes.findOne({ where: { slug: archetypeSlug } });
        monsterId = template?.monsterId;
      }

      const tags = uniqueStrings([
        ...(seed.role ? [seed.role] : []),
        ...asArray(seed.reputation_seed?.tags),
      ]);

      const npc =
        byName.get(key) ??
        repo.create({
          campaignId,
          slug: this.generateSlug(name),
          name,
          provenance: "manual",
        });
      npc.title = clean(seed.title) || npc.title;
      npc.race = clean(seed.race) || npc.race;
      npc.description = clean(seed.description) || npc.description;
      npc.descriptionHidden = clean(seed.description_hidden) || npc.descriptionHidden;
      npc.monsterId = monsterId ?? npc.monsterId;
      npc.personalityBig5 = seed.personality_big5 ?? npc.personalityBig5 ?? {};
      npc.motivation = clean(seed.motivation) || npc.motivation;
      npc.knowledgeScope = seed.knowledge_scope ?? npc.knowledgeScope ?? [];
      npc.dialogueStyle = clean(seed.dialogue_style) || npc.dialogueStyle;
      npc.voiceNotes = clean(seed.voice_notes) || npc.voiceNotes;
      npc.profileDepth =
        seed.profile_depth ?? npc.profileDepth ?? (index < 12 ? "core" : "supporting");
      npc.homeLocationId = homeLocation?.id ?? npc.homeLocationId;
      npc.homePoiId =
        this.cleanResidentPoiId(seed.homePoiId, poisByLocation) ||
        this.cleanResidentPoiId(npc.homePoiId, poisByLocation) ||
        this.pickFallbackPoiId(homeLocation?.id, poisByLocation, index) ||
        this.pickDefaultResidentPoiId(homeLocation?.id, poisByLocation);
      npc.routineSlots =
        seed.routineSlots ??
        npc.routineSlots ??
        (npc.profileDepth === "core"
          ? this.buildRoutineSlots(homeLocation?.id, npc.homePoiId, poisByLocation)
          : null);
      npc.tags = uniqueStrings([...(npc.tags ?? []), ...tags]);

      const saved = await repo.save(npc);
      byName.set(key, saved);
    }

    return byName;
  }

  private allocateNpcsByPoiKind(
    seeds: NpcSeed[],
    locations: Map<string, LocationEntity>,
    fallbackLocation: LocationEntity | undefined,
    poisByLocation: Map<string, LocationPoiEntity[]>,
    maxNpcs?: number,
  ): NpcSeed[] {
    const budget =
      maxNpcs && Number.isFinite(maxNpcs)
        ? Math.max(0, Math.floor(maxNpcs))
        : Math.max(seeds.length, 12);
    const result: NpcSeed[] = [];
    const consumed = new Set<number>();
    const usedNames = new Set<string>();
    const poiCounters = new Map<string, number>();
    const add = (seed: NpcSeed, seedIndex?: number): boolean => {
      if (result.length >= budget) return false;
      const name = clean(seed.name);
      if (!name) return false;
      const key = normalizeKey(name);
      if (usedNames.has(key)) return false;
      usedNames.add(key);
      if (seedIndex !== undefined) consumed.add(seedIndex);
      result.push(seed);
      return true;
    };
    const allPois = Array.from(poisByLocation.values())
      .flat()
      .filter((poi) => poi.isKnownToParty && !poi.isLocked)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const socialPois = allPois.filter((poi) => poi.kind === "social");
    const objectivePois = allPois.filter(
      (poi) => poi.kind === "objective" && poi.phaseIndex !== null && poi.phaseIndex !== undefined,
    );
    const safePois = allPois.filter((poi) => poi.kind === "safe");

    for (const poi of socialPois) {
      const match = this.takeSeedForPoi(seeds, consumed, poi);
      add(match ? match.seed : this.createAnchorNpcSeed(poi, "social"), match?.index);
    }

    for (const poi of objectivePois) {
      const match = this.takeSeedForPoi(seeds, consumed, poi);
      add(match ? match.seed : this.createAnchorNpcSeed(poi, "objective"), match?.index);
    }

    for (const [index, seed] of seeds.entries()) {
      if (consumed.has(index)) continue;
      const profileDepth = seed.profile_depth ?? (index < 12 ? "core" : undefined);
      if (profileDepth !== "core") continue;
      const homeLocation = this.resolveNpcHomeLocation(seed, locations, fallbackLocation);
      add(
        {
          ...seed,
          profile_depth: "core",
          homeLocationId: seed.homeLocationId ?? homeLocation?.id,
          homePoiId:
            this.cleanResidentPoiId(seed.homePoiId, poisByLocation) ||
            this.pickFallbackPoiId(homeLocation?.id, poisByLocation, index),
        },
        index,
      );
    }

    for (const poi of safePois) {
      const match = this.takeUnconsumedSeed(seeds, consumed, (seed) => {
        const homeLocation = this.resolveNpcHomeLocation(seed, locations, fallbackLocation);
        return homeLocation?.id === poi.locationId;
      });
      if (!match) continue;
      add(
        {
          ...match.seed,
          homeLocationId: match.seed.homeLocationId ?? poi.locationId,
          homePoiId: this.cleanResidentPoiId(match.seed.homePoiId, poisByLocation) || poi.id,
        },
        match.index,
      );
    }

    for (const [index, seed] of seeds.entries()) {
      if (consumed.has(index)) continue;
      const homeLocation = this.resolveNpcHomeLocation(seed, locations, fallbackLocation);
      add(
        {
          ...seed,
          homeLocationId: seed.homeLocationId ?? homeLocation?.id,
          homePoiId:
            this.cleanResidentPoiId(seed.homePoiId, poisByLocation) ||
            this.pickFallbackPoiId(homeLocation?.id, poisByLocation, poiCounters),
        },
        index,
      );
    }

    return result;
  }

  private takeSeedForPoi(
    seeds: NpcSeed[],
    consumed: Set<number>,
    poi: LocationPoiEntity,
  ): { seed: NpcSeed; index: number } | null {
    for (const [index, seed] of seeds.entries()) {
      if (consumed.has(index)) continue;
      if (clean(seed.homePoiId) === poi.id) {
        return { seed, index };
      }
    }
    return null;
  }

  private takeUnconsumedSeed(
    seeds: NpcSeed[],
    consumed: Set<number>,
    predicate: (seed: NpcSeed) => boolean,
  ): { seed: NpcSeed; index: number } | null {
    for (const [index, seed] of seeds.entries()) {
      if (consumed.has(index)) continue;
      if (predicate(seed)) return { seed, index };
    }
    return null;
  }

  private resolveNpcHomeLocation(
    seed: NpcSeed,
    locations: Map<string, LocationEntity>,
    fallbackLocation: LocationEntity | undefined,
  ): LocationEntity | undefined {
    return (
      (seed.homeLocationId
        ? Array.from(locations.values()).find(
            (location) => location.id === seed.homeLocationId,
          )
        : undefined) ??
      (seed.location_name ? locations.get(normalizeKey(seed.location_name)) : undefined) ??
      fallbackLocation
    );
  }

  private createAnchorNpcSeed(
    poi: LocationPoiEntity,
    kind: "social" | "objective",
  ): NpcSeed {
    const role = this.anchorRoleForPoi(poi, kind);
    return {
      name: `${role.name} de ${poi.name}`,
      title: role.title,
      role: role.tag,
      profile_depth: "core",
      archetype_slug: role.archetypeSlug,
      homeLocationId: poi.locationId,
      homePoiId: poi.id,
      knowledge_scope: [`poi:${poi.id}`, `location:${poi.locationId}`],
      reputation_seed: {
        tags: ["anchor", `poi:${poi.kind}`, role.tag],
      },
    };
  }

  private anchorRoleForPoi(
    poi: LocationPoiEntity,
    kind: "social" | "objective",
  ): { name: string; title: string; tag: string; archetypeSlug?: string } {
    const text = normalizeKey(
      `${poi.name} ${poi.type} ${(poi.tags ?? []).join(" ")} ${poi.narrativeRole ?? ""}`,
    );
    if (kind === "objective") {
      return {
        name: "Guardião",
        title: "Âncora da fase",
        tag: "objective-anchor",
        archetypeSlug: "guard",
      };
    }
    if (text.includes("templo") || text.includes("shrine") || text.includes("sant")) {
      return {
        name: "Sacerdote",
        title: "Sacerdote local",
        tag: "priest",
        archetypeSlug: "priest",
      };
    }
    if (text.includes("mercado") || text.includes("market") || text.includes("loja")) {
      return {
        name: "Mercador",
        title: "Mercador local",
        tag: "merchant",
        archetypeSlug: "commoner",
      };
    }
    return {
      name: "Taverneiro",
      title: "Anfitrião local",
      tag: "bartender",
      archetypeSlug: "commoner",
    };
  }

  private pickFallbackPoiId(
    locationId: string | undefined,
    poisByLocation: Map<string, LocationPoiEntity[]>,
    fallbackPoiCounters: Map<string, number> | number,
  ): string | undefined {
    if (!locationId) return undefined;
    const pois = poisByLocation.get(locationId) ?? [];
    if (pois.length === 0) return undefined;

    const assignablePois = pois.filter(
      (poi) => poi.isKnownToParty && !poi.isLocked && poi.kind !== "wild",
    );
    const candidates = assignablePois.length > 0 ? assignablePois : [];
    if (candidates.length === 0) return undefined;
    const count =
      fallbackPoiCounters instanceof Map
        ? fallbackPoiCounters.get(locationId) ?? 0
        : fallbackPoiCounters;
    if (fallbackPoiCounters instanceof Map) {
      fallbackPoiCounters.set(locationId, count + 1);
    }
    return candidates[count % candidates.length]?.id;
  }

  // Spec 047: deriva o `kind` de um POI a partir do tipo do local. Locais
  // civilizados (city/district/building/region) hospedam residentes → POIs
  // acessíveis viram "safe"; locais selvagens/dungeon mantêm "wild" (encontros
  // aleatórios). POIs secretos/trancados são sempre "wild". Mantém um kind já
  // significativo (social/objective) se presente.
  private derivePoiKind(
    location: LocationEntity,
    poi: LocationPoiEntity,
  ): "safe" | "wild" | "objective" | "social" {
    if (poi.kind && poi.kind !== "wild") return poi.kind;
    if (poi.isSecret || poi.isLocked || !poi.isKnownToParty) return "wild";
    const locType = normalizeKey(location.type ?? "");
    const wildLocation =
      locType.includes("wild") ||
      locType.includes("selv") ||
      locType.includes("dungeon") ||
      locType.includes("masmorra") ||
      locType.includes("floresta") ||
      locType.includes("forest") ||
      locType.includes("cave") ||
      locType.includes("caverna") ||
      locType.includes("ruin") ||
      locType.includes("ruina");
    return wildLocation ? "wild" : "safe";
  }

  // Spec 047: último recurso quando a cadeia normal (seed/explícito/fallback por
  // kind) não resolve um POI — garante que um residente com home_location sempre
  // ganhe um home_poi. Prefere POIs acessíveis e não-wild; cai para o default.
  private pickDefaultResidentPoiId(
    locationId: string | undefined,
    poisByLocation: Map<string, LocationPoiEntity[]>,
  ): string | undefined {
    if (!locationId) return undefined;
    const pois = (poisByLocation.get(locationId) ?? [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (pois.length === 0) return undefined;
    const accessible = pois.filter((poi) => poi.isKnownToParty && !poi.isLocked);
    const nonWild = accessible.filter((poi) => poi.kind !== "wild");
    const pool =
      nonWild.length > 0 ? nonWild : accessible.length > 0 ? accessible : pois;
    return (pool.find((poi) => poi.isDefault) ?? pool[0])?.id;
  }

  private cleanResidentPoiId(
    poiId: string | null | undefined,
    poisByLocation: Map<string, LocationPoiEntity[]>,
  ): string | undefined {
    const cleaned = clean(poiId);
    if (!cleaned) return undefined;
    for (const pois of poisByLocation.values()) {
      const poi = pois.find((candidate) => candidate.id === cleaned);
      if (poi?.kind === "wild") return undefined;
    }
    return cleaned;
  }

  private buildRoutineSlots(
    locationId: string | undefined,
    homePoiId: string | undefined,
    poisByLocation: Map<string, LocationPoiEntity[]>,
  ): NpcRoutineSlots | null {
    if (!locationId || !homePoiId) return null;
    const pois = (poisByLocation.get(locationId) ?? [])
      .filter((poi) => poi.isKnownToParty && !poi.isLocked && poi.kind !== "wild")
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const uniquePoiIds = uniqueStrings([
      homePoiId,
      ...pois.map((poi) => poi.id),
    ]);
    if (uniquePoiIds.length < 2) return null;
    return {
      morning: uniquePoiIds[0],
      afternoon: uniquePoiIds[1] ?? uniquePoiIds[0],
      evening: uniquePoiIds[2] ?? uniquePoiIds[0],
      night: uniquePoiIds[3] ?? uniquePoiIds[0],
    };
  }

  private async persistLoreEntries(
    manager: EntityManager,
    campaignId: string,
    seeds: LoreSeed[],
  ): Promise<Map<string, LoreEntryEntity>> {
    const repo = manager.getRepository(LoreEntryEntity);
    const byName = this.mapByName(await repo.find({ where: { campaignId } }));

    for (const seed of seeds) {
      const name = clean(seed.title) || clean(seed.name);
      const description = clean(seed.body) || clean(seed.description);
      if (!name || !description) continue;

      const entry =
        byName.get(normalizeKey(name)) ??
        repo.create({
          campaignId,
          name,
        });
      entry.description = description;
      entry.activationKeys = uniqueStrings(
        (seed.activationKeys?.length ? seed.activationKeys : [name]).map((key) =>
          key.toLowerCase().trim(),
        ),
      );
      entry.entityType = this.normalizeLoreEntityType(seed.category ?? seed.entityType);
      entry.isPersistent = true;
      entry.priority = entry.priority ?? 5;
      entry.maxTokensInject = entry.maxTokensInject ?? 400;
      const saved = await repo.save(entry);
      byName.set(normalizeKey(name), saved);
    }

    return byName;
  }

  private async persistClocks(
    manager: EntityManager,
    campaignId: string,
    seeds: ClockSeed[],
  ): Promise<number> {
    const repo = manager.getRepository(ClockEntity);
    const byName = this.mapByName(
      await repo.find({ where: { campaignId, gameSessionId: IsNull() } }),
    );
    let savedCount = 0;

    for (const seed of seeds) {
      const name = clean(seed.name);
      const segments = clamp(seed.segments, 1, 24, 4);
      if (!name) continue;

      const clock =
        byName.get(normalizeKey(name)) ??
        repo.create({
          campaignId,
          gameSessionId: null,
          name,
        });
      clock.segments = segments;
      clock.filled = clamp(seed.filled, 0, segments, clock.filled ?? 0);
      clock.status = "active";
      clock.type = this.normalizeClockType(seed.type);
      clock.visibleToPlayer = seed.visibleToPlayer ?? true;
      clock.onFullAction = seed.onFullAction ?? clock.onFullAction ?? {};
      clock.advanceRules = seed.advanceRules ?? clock.advanceRules ?? {};
      clock.expiresAt = seed.expiresAt ? new Date(seed.expiresAt) : clock.expiresAt;
      const saved = await repo.save(clock);
      byName.set(normalizeKey(name), saved);
      savedCount += 1;
    }

    return savedCount;
  }

  private async persistStoryArc(
    manager: EntityManager,
    campaignId: string,
    seed: StoryArcSeed | null,
  ): Promise<number> {
    const name = clean(seed?.name);
    if (!seed || !name) return 0;

    const repo = manager.getRepository(StoryArcEntity);
    const isMainArc = seed.isMainArc ?? true;
    let arc =
      (isMainArc
        ? await repo.findOne({ where: { campaignId, isMainArc: true } })
        : null) ??
      (await repo
        .createQueryBuilder("arc")
        .where("arc.campaign_id = :campaignId", { campaignId })
        .andWhere("LOWER(arc.name) = LOWER(:name)", { name })
        .getOne());

    if (!arc) {
      arc = repo.create({ campaignId, name });
    }

    arc.name = name;
    arc.description = this.describeStoryArc(seed) || arc.description;
    arc.sortOrder = seed.sortOrder ?? arc.sortOrder ?? 0;
    arc.isMainArc = isMainArc;
    arc.isActive = seed.isActive ?? true;
    await repo.save(arc);
    return 1;
  }

  private async persistNpcNarrativeLinks(
    manager: EntityManager,
    seeds: NpcSeed[],
    npcs: Map<string, NpcEntity>,
    factions: Map<string, FactionEntity>,
    locations: Map<string, LocationEntity>,
    loreEntries: Map<string, LoreEntryEntity>,
  ): Promise<{ relationships: number; storyHooks: number }> {
    let relationships = 0;
    let storyHooks = 0;

    for (const [index, seed] of seeds.entries()) {
      const source = npcs.get(normalizeKey(seed.name));
      if (!source) continue;

      for (const relationship of asArray(seed.relationships)) {
        const target = npcs.get(normalizeKey(relationship.target_name));
        if (!target || target.id === source.id) continue;
        const saved = await this.upsertNpcRelationship(manager, {
          sourceNpcId: source.id,
          targetNpcId: target.id,
          relationshipType:
            clean(relationship.relationshipType) || clean(relationship.type) || "ally",
          description: clean(relationship.description) || undefined,
          strength: relationship.strength,
          isKnownToParty: relationship.isKnownToParty,
        });
        if (saved) relationships += 1;
      }

      const faction = seed.faction_slug
        ? factions.get(normalizeKey(seed.faction_slug))
        : undefined;
      if (faction) {
        const saved = await this.upsertNpcRelationship(manager, {
          sourceNpcId: source.id,
          targetFactionId: faction.id,
          relationshipType: "member",
          description: `${source.name} belongs to or answers to ${faction.name}.`,
          strength: 5,
          isKnownToParty: true,
        });
        if (saved) relationships += 1;
      }

      const hooks = this.buildFallbackStoryHooks(seed, source, index);
      for (const hook of hooks) {
        const saved = await this.upsertNpcStoryHook(manager, source.id, hook, {
          npcs,
          locations,
          factions,
          loreEntries,
        });
        if (saved) storyHooks += 1;
      }
    }

    return { relationships, storyHooks };
  }

  private async upsertNpcRelationship(
    manager: EntityManager,
    dto: {
      sourceNpcId: string;
      targetNpcId?: string;
      targetFactionId?: string;
      relationshipType: string;
      description?: string;
      strength?: number;
      isKnownToParty?: boolean;
    },
  ): Promise<NpcRelationshipEntity | null> {
    if (!dto.targetNpcId && !dto.targetFactionId) return null;
    const repo = manager.getRepository(NpcRelationshipEntity);
    const qb = repo
      .createQueryBuilder("rel")
      .where("rel.source_npc_id = :sourceNpcId", {
        sourceNpcId: dto.sourceNpcId,
      })
      .andWhere("rel.relationship_type = :relationshipType", {
        relationshipType: dto.relationshipType,
      });

    if (dto.targetNpcId) {
      qb.andWhere("rel.target_npc_id = :targetNpcId", {
        targetNpcId: dto.targetNpcId,
      });
    } else {
      qb.andWhere("rel.target_faction_id = :targetFactionId", {
        targetFactionId: dto.targetFactionId,
      });
    }

    const relationship =
      (await qb.getOne()) ??
      repo.create({
        sourceNpcId: dto.sourceNpcId,
        targetNpcId: dto.targetNpcId,
        targetFactionId: dto.targetFactionId,
      });
    relationship.relationshipType = dto.relationshipType;
    relationship.description = dto.description ?? relationship.description;
    relationship.strength = dto.strength ?? relationship.strength ?? 5;
    relationship.isKnownToParty =
      dto.isKnownToParty ?? relationship.isKnownToParty ?? false;
    return repo.save(relationship);
  }

  private async upsertNpcStoryHook(
    manager: EntityManager,
    npcId: string,
    seed: NpcStoryHookSeed,
    maps: {
      npcs: Map<string, NpcEntity>;
      locations: Map<string, LocationEntity>;
      factions: Map<string, FactionEntity>;
      loreEntries: Map<string, LoreEntryEntity>;
    },
  ): Promise<NpcStoryHookEntity | null> {
    const hookType = clean(seed.hookType) || clean(seed.hook_type);
    if (!hookType) return null;

    const relatedEntityType =
      (clean(seed.relatedEntityType) || clean(seed.related_entity_type)) as
        | NpcStoryHookRelatedEntityType
        | undefined;
    const relatedEntityName =
      clean(seed.relatedEntityName) || clean(seed.related_entity_name);
    const relatedEntityId = this.resolveRelatedEntityId(seed, maps);

    const repo = manager.getRepository(NpcStoryHookEntity);
    const existing = await repo.findOne({
      where: {
        npcId,
        hookType: hookType as NpcStoryHookType,
        relatedEntityName: relatedEntityName || undefined,
      },
    });

    const hook =
      existing ??
      repo.create({
        npcId,
      });
    hook.hookType = hookType as NpcStoryHookType;
    hook.title = clean(seed.title) || hook.title;
    hook.description = clean(seed.description) || hook.description;
    hook.relatedEntityType = relatedEntityType;
    hook.relatedEntityId = relatedEntityId;
    hook.relatedEntityName = relatedEntityName || hook.relatedEntityName;
    hook.isKnownToParty = seed.isKnownToParty ?? hook.isKnownToParty ?? false;
    hook.priority = seed.priority ?? hook.priority ?? 5;
    hook.metadata = seed.metadata ?? hook.metadata ?? {};

    const sourceNpc = Array.from(maps.npcs.values()).find((npc) => npc.id === npcId);
    if (sourceNpc) hook.campaignId = sourceNpc.campaignId;

    return repo.save(hook);
  }

  private buildFallbackStoryHooks(
    seed: NpcSeed,
    source: NpcEntity,
    ordinal: number,
  ): NpcStoryHookSeed[] {
    const hooks = [...asArray(seed.story_hooks)];
    const depth = seed.profile_depth ?? source.profileDepth ?? (ordinal < 12 ? "core" : "supporting");
    const required = depth === "core" ? 2 : 1;
    const hasType = (type: string) =>
      hooks.some((hook) => (hook.hook_type ?? hook.hookType) === type);

    if (seed.location_name && hooks.length < required && !hasType("witness")) {
      hooks.push({
        hook_type: "witness",
        title: `Local anchor: ${seed.location_name}`,
        description: `${source.name} has a recurring presence in ${seed.location_name}.`,
        related_entity_type: "location",
        related_entity_name: seed.location_name,
        priority: 4,
        isKnownToParty: true,
      });
    }
    if (seed.faction_slug && hooks.length < required && !hasType("faction_agent")) {
      hooks.push({
        hook_type: "faction_agent",
        title: `Link to ${seed.faction_slug}`,
        description: `${source.name} can move information or favors through ${seed.faction_slug}.`,
        related_entity_type: "faction",
        related_entity_name: seed.faction_slug,
        priority: 5,
        isKnownToParty: true,
      });
    }
    if (seed.description_hidden && hooks.length < required && !hasType("secret_keeper")) {
      hooks.push({
        hook_type: "secret_keeper",
        title: "Hidden secret",
        description: seed.description_hidden,
        priority: 6,
        isKnownToParty: false,
      });
    }
    if (
      (seed.role ?? "").toLowerCase().includes("merchant") &&
      hooks.length < required &&
      !hasType("merchant")
    ) {
      hooks.push({
        hook_type: "merchant",
        title: "Trade contact",
        description: `${source.name} can offer resources, rumors, or exchanges.`,
        priority: 4,
        isKnownToParty: true,
      });
    }
    while (hooks.length < required) {
      hooks.push({
        hook_type: "clue_holder",
        title: "Narrative hook",
        description: `${source.name} holds useful information for the adventure.`,
        priority: 3,
        isKnownToParty: true,
      });
    }

    return hooks;
  }

  private resolveRelatedEntityId(
    seed: NpcStoryHookSeed,
    maps: {
      npcs: Map<string, NpcEntity>;
      locations: Map<string, LocationEntity>;
      factions: Map<string, FactionEntity>;
      loreEntries: Map<string, LoreEntryEntity>;
    },
  ): string | undefined {
    const explicitId = clean(seed.relatedEntityId) || clean(seed.related_entity_id);
    if (isUuid(explicitId)) return explicitId;

    const type = clean(seed.relatedEntityType) || clean(seed.related_entity_type);
    const name = clean(seed.relatedEntityName) || clean(seed.related_entity_name);
    if (!type || !name) return undefined;

    if (type === "npc") return maps.npcs.get(normalizeKey(name))?.id;
    if (type === "location") return maps.locations.get(normalizeKey(name))?.id;
    if (type === "faction") return maps.factions.get(normalizeKey(name))?.id;
    if (type === "lore_entry") return maps.loreEntries.get(normalizeKey(name))?.id;
    return undefined;
  }

  private resolveStartingLocation(
    locations: Map<string, LocationEntity>,
    startingLocationName?: string | null,
  ): LocationEntity | undefined {
    return (
      (startingLocationName
        ? locations.get(normalizeKey(startingLocationName))
        : undefined) ?? Array.from(locations.values())[0]
    );
  }

  private describeStoryArc(seed: StoryArcSeed): string | undefined {
    if (clean(seed.description)) return clean(seed.description);
    const phaseNotes = seed.phaseNotes ?? {};
    const parts = [
      seed.premise,
      seed.hook ?? phaseNotes.hook,
      seed.development ?? phaseNotes.development,
      seed.climax ?? phaseNotes.climax,
      seed.resolution ?? phaseNotes.resolution,
    ]
      .map(clean)
      .filter(Boolean);
    return parts.length > 0 ? parts.join("\n\n") : undefined;
  }

  private normalizeClockType(value: unknown): "main" | "threat" | "opportunity" {
    return value === "main" || value === "opportunity" || value === "threat"
      ? value
      : "threat";
  }

  private normalizeLoreEntityType(value: unknown): LoreEntryEntityType {
    return value === "npc" ||
      value === "location" ||
      value === "faction" ||
      value === "item"
      ? value
      : "lore";
  }

  private uniqueByName<T extends { name?: string | null }>(items: T[]): T[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = normalizeKey(item.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private uniqueLore(items: LoreSeed[]): LoreSeed[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = normalizeKey(item.title ?? item.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private mapByName<T extends { name: string }>(items: T[]): Map<string, T> {
    const map = new Map<string, T>();
    for (const item of items) {
      const key = normalizeKey(item.name);
      if (key && !map.has(key)) map.set(key, item);
    }
    return map;
  }

  private generateSlug(name: string): string {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "item";
    return `${base}-${randomBytes(3).toString("hex")}`;
  }
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: unknown): string {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clamp(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleanValue = clean(value);
    const key = normalizeKey(cleanValue);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleanValue);
  }
  return result;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
