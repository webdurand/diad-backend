import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, IsNull, Repository } from "typeorm";
import { CampaignEntity } from "src/entities/campaign.entity";
import { ClockEntity } from "src/entities/clock.entity";
import { CharacterEntity } from "src/entities/character.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { LocationPoiEntity } from "src/entities/location-poi.entity";
import { NpcEntity } from "src/entities/npc.entity";
import { SceneEntity } from "src/entities/scene.entity";
import {
  PhaseArcBeat,
  PhaseConditionSet,
  PhaseDeprecatesOnAdvance,
  PhaseEmotionalArc,
  PhaseEntity,
} from "src/entities/phase.entity";
import { PhaseTransitionEntity } from "src/entities/phase-transition.entity";
import { BookendArtifactEntity } from "src/entities/bookend-artifact.entity";
import { QuestEntity } from "src/entities/quest.entity";
import { QuestObjectiveEntity } from "src/entities/quest-objective.entity";
import { SessionEventEntity } from "src/entities/session-event.entity";
import { SessionMessageEntity } from "src/entities/session-message.entity";
import { SessionStoryArcStateEntity } from "src/entities/session-story-arc-state.entity";
import { StoryArcEntity } from "src/entities/story-arc.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventAudience } from "src/common/event-bus/event-envelope.types";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import {
  createEmptyXpTriggerState,
  normalizeXpTriggerState,
} from "src/models/story-hidden-layer/domain/hidden-layer.types";
import { QuestService } from "./quest.service";

const PULL_THRESHOLD = 3;
const MAIN_QUEST_CACHE_TTL_MS = 30_000;
const PREVIOUSLY_ON_GAP_MINUTES = 30;
const STORY_AUDIENCES: EventAudience[] = [
  "Narrator",
  "Director",
  "HUD",
  "CompanionAI",
];

export type GateStatus = "pending" | "locked";

export interface GateFacts {
  questStatuses?: Map<string, string>;
  mainQuestCompleted?: boolean;
  objectiveStatuses?: Map<string, string>;
  objectiveProgress?: Map<string, number>;
  clockFilledIds?: Set<string>;
  clockFilledKeys?: Set<string>;
  decisionIds?: Set<string>;
  decisionKeys?: Set<string>;
  locationVisitedIds?: Set<string>;
  locationVisitedKeys?: Set<string>;
  combatCompletedIds?: Set<string>;
  combatCompletedKeys?: Set<string>;
  arcBeatsReached?: Set<string>;
  nlTriggerSatisfiedKeys?: Set<string>;
}

export interface GateEvaluation {
  status: GateStatus;
  satisfiedCount: number;
  totalConditions: number;
  satisfiedKinds: string[];
}

export interface PhaseSeed {
  index: number;
  name: string;
  description?: string | null;
  emotionalArc: PhaseEmotionalArc;
  arcBeats: PhaseArcBeat[];
  unlockConditions: PhaseConditionSet;
  completionConditions: PhaseConditionSet;
  transitionBeatNarrativeSeed?: string | null;
}

export interface StorySeed {
  premise: string;
  dramaticQuestion: string;
  protagonistHook: string;
  phases: PhaseSeed[];
  antagonistForce?: string;
  stakes?: { personal?: string; world?: string };
  toneAnchors?: string[];
}

export interface PhaseGatePendingPayload {
  sessionId: string;
  fromPhase: { index: number; name: string };
  toPhase: { index: number; name: string };
  narrativeDescriptor: string;
  lostObjectives: Array<{ id: string; description: string }>;
  migratingNpcs: Array<{
    npcId: string;
    name: string;
    fromRole: string;
    toRole: string;
  }>;
  deprecatedPois: Array<{ poiId: string; name: string }>;
  expiresAt: string;
}

export interface PhaseDto {
  id: string;
  storyArcId: string;
  index: number;
  name: string;
  description: string | null;
  emotionalArc: PhaseEmotionalArc;
  arcBeats: PhaseArcBeat[];
  unlockConditions: PhaseConditionSet;
  completionConditions: PhaseConditionSet;
  transitionBeatNarrativeSeed: string | null;
  deprecatesOnAdvance: PhaseDeprecatesOnAdvance;
  isReversible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MissionPanelPayload {
  quest: {
    id: string;
    name: string;
    description: string | null;
    isMainQuest: true;
    storyArcId: string;
  };
  activeObjective: {
    id: string;
    description: string;
    status: QuestObjectiveEntity["status"];
    priority: number;
    sortOrder: number;
    progressCount: number;
    lastNarrativeDescriptor: string | null;
    completionConditions: Record<string, unknown>;
  };
  currentPhase: PhaseDto;
  phaseProgress: {
    satisfiedCount: number;
    totalConditions: number;
    satisfiedKinds: string[];
  };
  mainClock: {
    id: string;
    name: string;
    segments: number;
    filled: number;
    type: ClockEntity["type"];
  } | null;
  pullState: {
    turnsSinceProgress: number;
    threshold: number;
    pullActive: boolean;
    pullScore: number | null;
  };
  pacing: {
    phaseIndex: number;
    phasesTotal: number;
    objectivesCompleted: number;
    objectivesTotal: number;
    turnsSinceProgress: number;
  };
  phaseHistory: Array<{
    index: number;
    name: string;
    completedAt: string;
  }>;
  bookendsCount: number;
  identity?: {
    currentTags: string[];
    history: Array<{
      added: string[];
      removed: string[];
      appliedAt: string;
      phaseTransitionId: string;
      rationale?: string;
    }>;
  };
}

interface MissionPanelCacheEntry {
  payload: MissionPanelPayload;
  expiresAt: number;
}

@Injectable()
export class PhaseService {
  private readonly mainQuestCache = new Map<string, MissionPanelCacheEntry>();

  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(StoryArcEntity)
    private readonly storyArcRepo: Repository<StoryArcEntity>,
    @InjectRepository(SessionStoryArcStateEntity)
    private readonly stateRepo: Repository<SessionStoryArcStateEntity>,
    @InjectRepository(PhaseEntity)
    private readonly phaseRepo: Repository<PhaseEntity>,
    @InjectRepository(PhaseTransitionEntity)
    private readonly transitionRepo: Repository<PhaseTransitionEntity>,
    @InjectRepository(QuestEntity)
    private readonly questRepo: Repository<QuestEntity>,
    @InjectRepository(QuestObjectiveEntity)
    private readonly objectiveRepo: Repository<QuestObjectiveEntity>,
    @InjectRepository(SessionEventEntity)
    private readonly eventRepo: Repository<SessionEventEntity>,
    @InjectRepository(NpcEntity)
    private readonly npcRepo: Repository<NpcEntity>,
    @InjectRepository(LocationPoiEntity)
    private readonly poiRepo: Repository<LocationPoiEntity>,
    @InjectRepository(ClockEntity)
    private readonly clockRepo: Repository<ClockEntity>,
    private readonly dataSource: DataSource,
    private readonly questService: QuestService,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    @Optional()
    @InjectRepository(BookendArtifactEntity)
    private readonly bookendArtifactRepo?: Repository<BookendArtifactEntity>,
    @Optional()
    @InjectRepository(CharacterEntity)
    private readonly characterRepo?: Repository<CharacterEntity>,
  ) {}

  evaluateGate(
    conditionSet: PhaseConditionSet | null | undefined,
    facts: GateFacts,
  ): GateEvaluation {
    const conditions = this.normalizeConditions(conditionSet);
    const satisfiedKinds: string[] = [];
    let satisfiedCount = 0;

    for (const condition of conditions) {
      if (this.isConditionSatisfied(condition, facts)) {
        satisfiedCount += 1;
        const kind = condition.naturalLanguage
          ? "naturalLanguage"
          : Object.keys(condition)[0];
        if (kind && !satisfiedKinds.includes(kind)) satisfiedKinds.push(kind);
      }
    }

    return {
      status: satisfiedCount > 0 ? "pending" : "locked",
      satisfiedCount,
      totalConditions: conditions.length,
      satisfiedKinds,
    };
  }

  selectActiveObjective(
    objectives: QuestObjectiveEntity[],
  ): QuestObjectiveEntity | null {
    return (
      objectives
        .filter((objective) => objective.status === "active")
        .sort((a, b) => {
          const priority = (b.priority ?? 0) - (a.priority ?? 0);
          if (priority !== 0) return priority;
          return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        })[0] ?? null
    );
  }

  async bootstrapStoryFirst(
    sessionId: string,
    campaign: CampaignEntity,
  ): Promise<void> {
    const seed = this.resolveStorySeed(campaign);
    const storyArc = await this.getOrCreateMainArc(campaign, seed);
    const phases = await this.getOrCreatePhases(storyArc.id, seed);

    const state = await this.stateRepo.findOne({
      where: { gameSessionId: sessionId, storyArcId: storyArc.id },
    });
    if (!state) {
      await this.stateRepo.save(
        this.stateRepo.create({
          gameSessionId: sessionId,
          storyArcId: storyArc.id,
          currentPhase: "hook",
          currentPhaseIndex: 1,
          phaseNotes: {},
          xpTriggerState: createEmptyXpTriggerState(),
        }),
      );
    }

    let mainQuest = await this.questRepo.findOne({
      where: { gameSessionId: sessionId, isMainQuest: true },
      relations: ["objectives"],
    });
    const createdMainQuest = !mainQuest;
    if (!mainQuest) {
      mainQuest = await this.questService.create(sessionId, {
        name: seed.dramaticQuestion.replace(/[?？]\s*$/, ""),
        description: `${seed.premise}\n\n${seed.protagonistHook}`,
        storyArcId: storyArc.id,
        isMainQuest: true,
        objectives: [
          {
            description:
              "Você reconheceu como a ameaça central já tocou sua história.",
          },
          {
            description:
              "Um rastro lateral ainda pode revelar quem se beneficia do conflito.",
            isOptional: true,
          },
        ],
      });
    } else if (!mainQuest.storyArcId) {
      mainQuest.storyArcId = storyArc.id;
      mainQuest = await this.questRepo.save(mainQuest);
    }

    await this.questService.revealQuest(
      sessionId,
      mainQuest.slug,
      "A missão principal entrou em foco no início da aventura.",
    );
    const objectives = await this.objectiveRepo.find({
      where: { questId: mainQuest.id },
    });
    await this.assignObjectivePriorities(objectives);

    const optionalObjective = objectives.find(
      (objective) => objective.isOptional,
    );
    const firstPhase = phases.find((phase) => phase.index === 1);
    if (firstPhase && optionalObjective) {
      const deprecates = this.normalizeDeprecates(
        firstPhase.deprecatesOnAdvance,
      );
      if (!deprecates.lostObjectives.includes(optionalObjective.id)) {
        firstPhase.deprecatesOnAdvance = {
          ...deprecates,
          lostObjectives: [...deprecates.lostObjectives, optionalObjective.id],
        };
        await this.phaseRepo.save(firstPhase);
      }
    }

    if (createdMainQuest) {
      await this.publishMainQuestAssigned(sessionId, campaign.id, mainQuest);
    }
    this.invalidateMainQuestCache(sessionId);
  }

  async getMainQuest(sessionId: string): Promise<MissionPanelPayload> {
    const cached = this.getCachedMainQuest(sessionId);
    if (cached) return cached;

    const { session, storyArc, state } = await this.loadMainArcState(sessionId);
    const phase = await this.phaseRepo.findOne({
      where: { storyArcId: storyArc.id, index: state.currentPhaseIndex },
    });
    if (!phase) {
      throw new NotFoundException("Fase atual não encontrada.");
    }

    const quest = await this.questRepo.findOne({
      where: { gameSessionId: sessionId, isMainQuest: true },
      relations: ["objectives"],
    });
    if (!quest) throw new NotFoundException("Missão principal não encontrada.");

    const activeObjective = await this.ensureMissionObjective(
      sessionId,
      quest,
      storyArc,
      state,
    );

    const facts = await this.collectFacts(sessionId, storyArc.id, state);
    const progress = this.evaluateGate(phase.completionConditions, facts);
    const phaseHistory = await this.loadPhaseHistory(sessionId, storyArc.id);
    const mainClock = session.campaignId
      ? await this.loadMainClock(sessionId, session.campaignId)
      : null;
    const phasesTotal = await this.phaseRepo.count({
      where: { storyArcId: storyArc.id },
    });
    const requiredObjectives = (quest.objectives ?? []).filter(
      (objective) => !objective.isOptional,
    );
    const objectivesCompleted = requiredObjectives.filter(
      (objective) => objective.status === "completed",
    ).length;
    const identity = await this.loadIdentityState(session);
    const bookendsCount =
      (await this.bookendArtifactRepo?.count({
        where: { gameSessionId: sessionId },
      })) ?? 0;

    const payload: MissionPanelPayload = {
      quest: {
        id: quest.id,
        name: quest.name,
        description: quest.description ?? null,
        isMainQuest: true,
        storyArcId: quest.storyArcId ?? storyArc.id,
      },
      activeObjective: {
        id: activeObjective.id,
        description: activeObjective.description,
        status: activeObjective.status,
        priority: activeObjective.priority ?? 0,
        sortOrder: activeObjective.sortOrder ?? 0,
        progressCount: activeObjective.progressCount ?? 0,
        lastNarrativeDescriptor: activeObjective.lastNarrativeDescriptor ?? null,
        completionConditions: activeObjective.completionConditions ?? {},
      },
      currentPhase: this.toPhaseDto(phase),
      phaseProgress: {
        satisfiedCount: progress.satisfiedCount,
        totalConditions: progress.totalConditions,
        satisfiedKinds: progress.satisfiedKinds,
      },
      mainClock,
      pullState: {
        turnsSinceProgress: session.turnsSinceMissionProgress ?? 0,
        threshold: PULL_THRESHOLD,
        pullActive: (session.turnsSinceMissionProgress ?? 0) >= PULL_THRESHOLD,
        pullScore: session.pullScore ?? null,
      },
      pacing: {
        phaseIndex: phase.index,
        phasesTotal,
        objectivesCompleted,
        objectivesTotal: requiredObjectives.length,
        turnsSinceProgress: session.turnsSinceMissionProgress ?? 0,
      },
      phaseHistory,
      bookendsCount,
      ...(identity ? { identity } : {}),
    };
    this.setCachedMainQuest(sessionId, payload);
    return payload;
  }

  invalidateMainQuestCache(sessionId: string | null | undefined): void {
    if (!sessionId) return;
    this.mainQuestCache.delete(sessionId);
  }

  private getCachedMainQuest(sessionId: string): MissionPanelPayload | null {
    const cached = this.mainQuestCache.get(sessionId);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.mainQuestCache.delete(sessionId);
      return null;
    }
    return cached.payload;
  }

  private setCachedMainQuest(
    sessionId: string,
    payload: MissionPanelPayload,
  ): void {
    this.mainQuestCache.set(sessionId, {
      payload,
      expiresAt: Date.now() + MAIN_QUEST_CACHE_TTL_MS,
    });
  }

  async advancePhase(
    sessionId: string,
    userId: string,
    confirmed: boolean,
    traceId?: string,
  ): Promise<MissionPanelPayload> {
    const { session, storyArc, state } = await this.loadMainArcState(sessionId);
    const [fromPhase, toPhase] = await Promise.all([
      this.phaseRepo.findOne({
        where: { storyArcId: storyArc.id, index: state.currentPhaseIndex },
      }),
      this.phaseRepo.findOne({
        where: { storyArcId: storyArc.id, index: state.currentPhaseIndex + 1 },
      }),
    ]);
    if (!fromPhase) throw new NotFoundException("Fase atual não encontrada.");
    if (!toPhase) return this.getMainQuest(sessionId);

    const facts = await this.collectFacts(sessionId, storyArc.id, state);
    const evaluation = this.evaluateGate(toPhase.unlockConditions, facts);
    if (evaluation.status !== "pending") {
      throw new DomainException(
        ErrorCode.LOCATION_REQUIREMENTS_NOT_MET,
        `A fase ${toPhase.name} ainda não foi destravada pela história.`,
        {
          context: {
            sessionId,
            fromPhaseIndex: fromPhase.index,
            toPhaseIndex: toPhase.index,
            phaseProgress: evaluation,
          },
          hint: "Continue a cena atual até algum gate narrativo ficar satisfeito.",
        },
      );
    }

    const pending = await this.buildPendingPayload(
      sessionId,
      fromPhase,
      toPhase,
    );
    if (!confirmed) {
      await this.publishPhaseGatePending(
        session,
        fromPhase,
        toPhase,
        pending,
        traceId,
      );
    }

    const transition = await this.commitAdvance(
      sessionId,
      storyArc.id,
      state.currentPhaseIndex,
      toPhase,
      userId,
      fromPhase,
      normalizeXpTriggerState(state.xpTriggerState),
    );
    this.invalidateMainQuestCache(sessionId);
    await this.publishPhaseChanged(
      session,
      fromPhase,
      toPhase,
      transition,
      traceId,
    );
    return this.getMainQuest(sessionId);
  }

  async publishPendingPhaseGateIfUnlocked(
    sessionId: string,
    traceId?: string,
  ): Promise<PhaseGatePendingPayload | null> {
    const { session, storyArc, state } = await this.loadMainArcState(sessionId);
    const [fromPhase, toPhase] = await Promise.all([
      this.phaseRepo.findOne({
        where: { storyArcId: storyArc.id, index: state.currentPhaseIndex },
      }),
      this.phaseRepo.findOne({
        where: { storyArcId: storyArc.id, index: state.currentPhaseIndex + 1 },
      }),
    ]);
    if (!fromPhase) throw new NotFoundException("Fase atual não encontrada.");
    if (!toPhase) return null;

    const facts = await this.collectFacts(sessionId, storyArc.id, state);
    const evaluation = this.evaluateGate(toPhase.unlockConditions, facts);
    if (evaluation.status !== "pending") return null;

    const pending = await this.buildPendingPayload(
      sessionId,
      fromPhase,
      toPhase,
    );
    await this.publishPhaseGatePending(
      session,
      fromPhase,
      toPhase,
      pending,
      traceId,
    );
    return pending;
  }

  private async commitAdvance(
    sessionId: string,
    storyArcId: string,
    expectedPhaseIndex: number,
    toPhase: PhaseEntity,
    userId: string,
    fromPhase: PhaseEntity,
    xpTriggerState = createEmptyXpTriggerState(),
  ): Promise<PhaseTransitionEntity> {
    let transition: PhaseTransitionEntity | null = null;
    await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(SessionStoryArcStateEntity)
        .set({
          currentPhaseIndex: toPhase.index,
          currentPhase: this.indexToLegacyPhase(toPhase.index),
          xpTriggerState: createEmptyXpTriggerState(),
        })
        .where("game_session_id = :sessionId", { sessionId })
        .andWhere("story_arc_id = :storyArcId", { storyArcId })
        .andWhere("current_phase_index = :expectedPhaseIndex", {
          expectedPhaseIndex,
        })
        .execute();
      if (result.affected !== 1) {
        throw new ConflictException({
          code: ErrorCode.IDEMPOTENCY_CACHE_MISS_AFTER_RACE,
          message: "A fase mudou enquanto a confirmação estava em andamento.",
        });
      }

      const lostObjectiveIds = this.normalizeDeprecates(
        fromPhase.deprecatesOnAdvance,
      ).lostObjectives;
      if (lostObjectiveIds.length > 0) {
        await manager
          .createQueryBuilder()
          .update(QuestObjectiveEntity)
          .set({ status: "failed" })
          .where("id IN (:...lostObjectiveIds)", { lostObjectiveIds })
          .andWhere("status IN (:...statuses)", {
            statuses: ["active", "locked", "optional"],
          })
          .execute();
      }

      transition = await manager.save(
        PhaseTransitionEntity,
        manager.create(PhaseTransitionEntity, {
          gameSessionId: sessionId,
          storyArcId,
          fromPhaseIndex: expectedPhaseIndex,
          toPhaseIndex: toPhase.index,
          transitionBeatNarrativeSeed: toPhase.transitionBeatNarrativeSeed,
          confirmedByUserId: userId,
          xpTriggerState,
        }),
      );
    });

    if (!transition) {
      throw new ConflictException("Transição de fase não persistida.");
    }
    return transition;
  }

  private async loadMainArcState(sessionId: string): Promise<{
    session: GameSessionEntity;
    storyArc: StoryArcEntity;
    state: SessionStoryArcStateEntity;
  }> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException("Sessão não encontrada.");
    if (!session.campaignId) {
      throw new NotFoundException("Sessão sem campanha vinculada.");
    }

    const storyArc = await this.storyArcRepo.findOne({
      where: {
        campaignId: session.campaignId,
        isMainArc: true,
        isActive: true,
      },
    });
    if (!storyArc)
      throw new NotFoundException("Arco principal não encontrado.");

    let state = await this.stateRepo.findOne({
      where: { gameSessionId: sessionId, storyArcId: storyArc.id },
    });
    if (!state) {
      state = await this.stateRepo.save(
        this.stateRepo.create({
          gameSessionId: sessionId,
          storyArcId: storyArc.id,
          currentPhase: "hook",
          currentPhaseIndex: 1,
          phaseNotes: {},
          xpTriggerState: createEmptyXpTriggerState(),
        }),
      );
    }

    return { session, storyArc, state };
  }

  private async collectFacts(
    sessionId: string,
    storyArcId: string,
    state: SessionStoryArcStateEntity,
  ): Promise<GateFacts> {
    const quests = await this.questRepo.find({
      where: { gameSessionId: sessionId },
    });
    const questIds = quests.map((quest) => quest.id);
    const [objectives, phases, events] = await Promise.all([
      questIds.length > 0
        ? this.objectiveRepo.find({ where: { questId: In(questIds) } })
        : Promise.resolve([]),
      this.phaseRepo.find({ where: { storyArcId } }),
      this.eventRepo.find({
        where: { sessionId },
        order: { createdAt: "DESC" },
        take: 200,
      }),
    ]);
    const eventFacts = this.collectEventFacts(events);

    return {
      questStatuses: new Map(quests.map((quest) => [quest.id, quest.status])),
      mainQuestCompleted: quests.some(
        (quest) => quest.isMainQuest && quest.status === "completed",
      ),
      objectiveStatuses: new Map(
        objectives.map((objective) => [objective.id, objective.status]),
      ),
      objectiveProgress: new Map(
        objectives.map((objective) => [
          objective.id,
          objective.progressCount ?? 0,
        ]),
      ),
      arcBeatsReached: new Set(
        phases
          .filter((phase) => phase.index <= state.currentPhaseIndex)
          .flatMap((phase) => phase.arcBeats ?? []),
      ),
      clockFilledIds: eventFacts.clockFilledIds,
      clockFilledKeys: eventFacts.clockFilledKeys,
      decisionIds: eventFacts.decisionIds,
      decisionKeys: eventFacts.decisionKeys,
      locationVisitedIds: eventFacts.locationVisitedIds,
      locationVisitedKeys: eventFacts.locationVisitedKeys,
      combatCompletedIds: eventFacts.combatCompletedIds,
      combatCompletedKeys: eventFacts.combatCompletedKeys,
      nlTriggerSatisfiedKeys: eventFacts.nlTriggerSatisfiedKeys,
    };
  }

  private collectEventFacts(
    events: SessionEventEntity[],
  ): Required<
    Pick<
      GateFacts,
      | "clockFilledIds"
      | "clockFilledKeys"
      | "decisionIds"
      | "decisionKeys"
      | "locationVisitedIds"
      | "locationVisitedKeys"
      | "combatCompletedIds"
      | "combatCompletedKeys"
      | "nlTriggerSatisfiedKeys"
    >
  > {
    const facts = {
      clockFilledIds: new Set<string>(),
      clockFilledKeys: new Set<string>(),
      decisionIds: new Set<string>(),
      decisionKeys: new Set<string>(),
      locationVisitedIds: new Set<string>(),
      locationVisitedKeys: new Set<string>(),
      combatCompletedIds: new Set<string>(),
      combatCompletedKeys: new Set<string>(),
      nlTriggerSatisfiedKeys: new Set<string>(),
    };

    for (const event of events) {
      const payload = (event.eventPayload ?? {}) as Record<string, unknown>;
      if (event.eventType === "clock_filled") {
        this.addFirstString(facts.clockFilledIds, [
          payload.clockId,
          payload.id,
          event.aggregateId,
        ]);
        this.addNormalizedKeys(facts.clockFilledKeys, [
          payload.clockSlug,
          payload.clockName,
          payload.name,
          event.summary,
        ]);
      } else if (event.eventType === "narrative_decision_made") {
        this.addFirstString(facts.decisionIds, [
          payload.narrativeDecisionId,
          payload.decisionId,
          event.aggregateId,
        ]);
        this.addNormalizedKeys(facts.decisionKeys, [
          payload.decisionSlug,
          payload.decisionText,
          payload.summary,
          event.summary,
        ]);
      } else if (event.eventType === "location_visited") {
        this.addFirstString(facts.locationVisitedIds, [
          payload.locationId,
          payload.id,
          event.aggregateId,
        ]);
        this.addNormalizedKeys(facts.locationVisitedKeys, [
          payload.locationSlug,
          payload.locationName,
          payload.name,
          event.summary,
        ]);
      } else if (event.eventType === "encounter_ended") {
        this.addFirstString(facts.combatCompletedIds, [
          payload.encounterId,
          payload.id,
          event.aggregateId,
        ]);
        this.addNormalizedKeys(facts.combatCompletedKeys, [
          payload.encounterSlug,
          payload.name,
          payload.encounterName,
          event.summary,
        ]);
      } else if (event.eventType === "nl_trigger_evaluated") {
        if (payload.satisfied === true) {
          this.addFirstString(facts.nlTriggerSatisfiedKeys, [
            payload.conditionKey,
            payload.naturalLanguage,
          ]);
        }
      }
    }

    return facts;
  }

  private addFirstString(target: Set<string>, values: unknown[]): void {
    const value = values.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.length > 0,
    );
    if (value) target.add(value);
  }

  private addNormalizedKeys(target: Set<string>, values: unknown[]): void {
    for (const value of values) {
      const key = this.normalizeFactKey(value);
      if (key) target.add(key);
    }
  }

  private normalizeFactKey(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    return normalized.length > 0 ? normalized : null;
  }

  private hasFact(
    rawId: string | null,
    idSet: Set<string> | undefined,
    keySet: Set<string> | undefined,
  ): boolean {
    if (!rawId) return false;
    if (idSet?.has(rawId)) return true;
    const key = this.normalizeFactKey(rawId);
    return Boolean(key && keySet?.has(key));
  }

  private async buildPendingPayload(
    sessionId: string,
    fromPhase: PhaseEntity,
    toPhase: PhaseEntity,
  ): Promise<PhaseGatePendingPayload> {
    const deprecates = this.normalizeDeprecates(fromPhase.deprecatesOnAdvance);
    const [objectives, npcs, pois] = await Promise.all([
      deprecates.lostObjectives.length
        ? this.objectiveRepo.find({
            where: { id: In(deprecates.lostObjectives) },
            select: ["id", "description"],
          })
        : Promise.resolve([]),
      deprecates.migratingNpcs.length
        ? this.npcRepo.find({
            where: {
              id: In(deprecates.migratingNpcs.map((entry) => entry.npcId)),
            },
            select: ["id", "name", "narrativeRole"],
          })
        : Promise.resolve([]),
      deprecates.deprecatedPois.length
        ? this.poiRepo.find({
            where: { id: In(deprecates.deprecatedPois) },
            select: ["id", "name"],
          })
        : Promise.resolve([]),
    ]);

    const npcById = new Map(npcs.map((npc) => [npc.id, npc]));
    return {
      sessionId,
      fromPhase: { index: fromPhase.index, name: fromPhase.name },
      toPhase: { index: toPhase.index, name: toPhase.name },
      narrativeDescriptor: `Você está prestes a entrar em ${toPhase.name}.`,
      lostObjectives: objectives.map((objective) => ({
        id: objective.id,
        description: objective.description,
      })),
      migratingNpcs: deprecates.migratingNpcs.map((entry) => {
        const npc = npcById.get(entry.npcId);
        return {
          npcId: entry.npcId,
          name: npc?.name ?? "NPC desconhecido",
          fromRole: npc?.narrativeRole ?? "desconhecido",
          toRole: entry.newRole,
        };
      }),
      deprecatedPois: pois.map((poi) => ({
        poiId: poi.id,
        name: poi.name,
      })),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  private async loadPhaseHistory(
    sessionId: string,
    storyArcId: string,
  ): Promise<MissionPanelPayload["phaseHistory"]> {
    const [transitions, phases] = await Promise.all([
      this.transitionRepo.find({
        where: { gameSessionId: sessionId, storyArcId },
        order: { createdAt: "ASC" },
      }),
      this.phaseRepo.find({ where: { storyArcId } }),
    ]);
    const phasesByIndex = new Map(phases.map((phase) => [phase.index, phase]));
    return transitions.map((transition) => ({
      index: transition.fromPhaseIndex,
      name:
        phasesByIndex.get(transition.fromPhaseIndex)?.name ??
        `Fase ${transition.fromPhaseIndex}`,
      completedAt: transition.createdAt.toISOString(),
    }));
  }

  private async loadIdentityState(
    session: GameSessionEntity,
  ): Promise<MissionPanelPayload["identity"] | null> {
    const pcId = session.characterIds?.[0];
    if (!pcId) return null;
    if (!this.characterRepo) return null;
    const pc = await this.characterRepo.findOne({
      where: { id: pcId },
      select: ["id", "currentIdentityTags", "identityTagsHistory"],
    });
    if (!pc) return null;
    return {
      currentTags: Array.isArray(pc.currentIdentityTags)
        ? pc.currentIdentityTags
        : [],
      history: Array.isArray(pc.identityTagsHistory)
        ? pc.identityTagsHistory.slice(-5)
        : [],
    };
  }

  private async assignObjectivePriorities(
    objectives: QuestObjectiveEntity[],
  ): Promise<void> {
    if (objectives.length === 0) return;
    for (const objective of objectives) {
      objective.priority = 1000 - 100 - (objective.sortOrder ?? 0);
      if (objective.isOptional) objective.status = "optional";
    }
    await this.objectiveRepo.save(objectives);
  }

  private async ensureMissionObjective(
    sessionId: string,
    quest: QuestEntity,
    storyArc: StoryArcEntity,
    state: SessionStoryArcStateEntity,
  ): Promise<QuestObjectiveEntity> {
    const active = this.selectActiveObjective(quest.objectives ?? []);
    if (active) return active;

    const sorted = (quest.objectives ?? [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const incomplete = sorted.find(
      (objective) =>
        !objective.isOptional &&
        objective.status !== "completed" &&
        objective.status !== "failed",
    );
    if (incomplete) {
      incomplete.status = "active";
      return this.objectiveRepo.save(incomplete);
    }

    const phasesTotal = await this.phaseRepo.count({
      where: { storyArcId: storyArc.id },
    });
    if (state.currentPhaseIndex < phasesTotal) {
      if (quest.status !== "active") {
        quest.status = "active";
        await this.questRepo.save(quest);
      }

      const targetPhaseIndex = state.currentPhaseIndex + 1;
      const existingTransition = sorted.find((objective) => {
        const conditions = objective.completionConditions ?? {};
        return (
          conditions.kind === "phase_transition" &&
          Number(conditions.targetPhaseIndex) === targetPhaseIndex &&
          objective.status !== "completed" &&
          objective.status !== "failed"
        );
      });
      if (existingTransition) {
        existingTransition.status = "active";
        return this.objectiveRepo.save(existingTransition);
      }

      const nextPhase = await this.phaseRepo.findOne({
        where: { storyArcId: storyArc.id, index: targetPhaseIndex },
      });
      const sortOrder =
        sorted.length > 0
          ? Math.max(...sorted.map((objective) => objective.sortOrder ?? 0)) + 1
          : 0;
      return this.objectiveRepo.save(
        this.objectiveRepo.create({
          questId: quest.id,
          description: nextPhase
            ? `Cruzar o limiar para ${nextPhase.name}.`
            : "Cruzar o próximo limiar da história.",
          sortOrder,
          status: "active",
          isOptional: false,
          priority: 1000 - 50 - sortOrder,
          progressCount: 0,
          completionConditions: {
            kind: "phase_transition",
            targetPhaseIndex,
          },
        }),
      );
    }

    const fallback = sorted
      .slice()
      .reverse()
      .find((objective) => objective.status === "completed");
    if (fallback) return fallback;

    throw new NotFoundException("Objetivo ativo da missão principal não encontrado.");
  }

  private async loadMainClock(
    sessionId: string,
    campaignId: string,
  ): Promise<MissionPanelPayload["mainClock"]> {
    const clocks = await this.clockRepo.find({
      where: [
        {
          gameSessionId: sessionId,
          visibleToPlayer: true,
          status: In(["active", "filled"]),
        },
        {
          campaignId,
          gameSessionId: IsNull(),
          visibleToPlayer: true,
          status: In(["active", "filled"]),
        },
      ],
    });
    const clock =
      clocks.find((candidate) => candidate.type === "main") ?? clocks[0] ?? null;
    if (!clock) return null;
    return {
      id: clock.id,
      name: clock.name,
      segments: clock.segments,
      filled: clock.filled,
      type: clock.type,
    };
  }

  private async getOrCreateMainArc(
    campaign: CampaignEntity,
    seed: StorySeed,
  ): Promise<StoryArcEntity> {
    const existing = await this.storyArcRepo.findOne({
      where: { campaignId: campaign.id, isMainArc: true },
    });
    if (existing) return existing;

    return this.storyArcRepo.save(
      this.storyArcRepo.create({
        campaignId: campaign.id,
        name: campaign.name,
        description: `${seed.premise}\n\n${seed.dramaticQuestion}`,
        sortOrder: 0,
        isActive: true,
        isMainArc: true,
      }),
    );
  }

  private async getOrCreatePhases(
    storyArcId: string,
    seed: StorySeed,
  ): Promise<PhaseEntity[]> {
    const existing = await this.phaseRepo.find({ where: { storyArcId } });
    const byIndex = new Map(existing.map((phase) => [phase.index, phase]));
    const created: PhaseEntity[] = [];
    for (const phaseSeed of seed.phases) {
      const current = byIndex.get(phaseSeed.index);
      if (current) {
        created.push(current);
        continue;
      }
      created.push(
        await this.phaseRepo.save(
          this.phaseRepo.create({
            storyArcId,
            index: phaseSeed.index,
            name: phaseSeed.name,
            description: phaseSeed.description ?? null,
            emotionalArc: phaseSeed.emotionalArc,
            arcBeats: phaseSeed.arcBeats,
            unlockConditions: phaseSeed.unlockConditions,
            completionConditions: phaseSeed.completionConditions,
            transitionBeatNarrativeSeed:
              phaseSeed.transitionBeatNarrativeSeed ?? null,
            deprecatesOnAdvance: {
              lostObjectives: [],
              migratingNpcs: [],
              deprecatedPois: [],
            },
            isReversible: false,
          }),
        ),
      );
    }
    return created.sort((a, b) => a.index - b.index);
  }

  private resolveStorySeed(campaign: CampaignEntity): StorySeed {
    const raw = campaign.generationSeed?.storySeed;
    if (raw && typeof raw === "object" && Array.isArray((raw as any).phases)) {
      return raw as StorySeed;
    }
    return PhaseService.buildDefaultStorySeed(campaign);
  }

  static buildDefaultStorySeed(
    campaign: Pick<
      CampaignEntity,
      "name" | "description" | "theme" | "setting"
    >,
  ): StorySeed {
    const setting = campaign.setting ?? "um mundo inquieto";
    const theme = campaign.theme ?? "segredos antigos";
    return {
      premise: `Em ${setting}, ${theme} ameaça transformar uma tensão local em uma crise que ninguém mais consegue ignorar.`,
      dramaticQuestion: `O herói descobrirá a verdade por trás de ${campaign.name}?`,
      protagonistHook:
        "Algo na história pessoal do protagonista ressoa com essa ameaça, tornando a investigação mais íntima do que parece.",
      antagonistForce: theme,
      stakes: {
        personal:
          "O protagonista perde a chance de dar sentido ao próprio passado.",
        world: "A comunidade ao redor paga o preço de uma ameaça sem nome.",
      },
      toneAnchors: ["misterioso", "íntimo", "heroico"],
      phases: [
        {
          index: 1,
          name: "O Chamado",
          emotionalArc: "rise",
          arcBeats: ["YOU", "NEED"],
          unlockConditions: { any: [{ always: true }] },
          completionConditions: { any: [{ objective_progressed: "any" }] },
          transitionBeatNarrativeSeed:
            "A primeira pista deixa de ser rumor e se torna caminho; o mundo parece estreitar ao redor da escolha do herói.",
        },
        {
          index: 2,
          name: "A Travessia",
          emotionalArc: "man-in-hole",
          arcBeats: ["GO", "SEARCH", "FIND"],
          unlockConditions: { any: [{ always: true }] },
          completionConditions: { any: [{ arc_beat_reached: "FIND" }] },
          transitionBeatNarrativeSeed:
            "A busca atravessa um limite visível: aliados hesitam, sinais antigos despertam, e a ameaça finalmente ganha forma.",
        },
        {
          index: 3,
          name: "O Confronto",
          emotionalArc: "cinderella",
          arcBeats: ["TAKE", "RETURN", "CHANGE"],
          unlockConditions: { any: [{ arc_beat_reached: "FIND" }] },
          completionConditions: { any: [{ quest_completed: "main" }] },
          transitionBeatNarrativeSeed:
            "O retorno cobra um preço; a resposta à pergunta central passa a depender de uma última decisão.",
        },
      ],
    };
  }

  private normalizeConditions(
    conditionSet: PhaseConditionSet | null | undefined,
  ): Array<Record<string, unknown>> {
    return Array.isArray(conditionSet?.any) ? conditionSet.any : [];
  }

  private normalizeDeprecates(
    value: PhaseDeprecatesOnAdvance | null | undefined,
  ): PhaseDeprecatesOnAdvance {
    return {
      lostObjectives: Array.isArray(value?.lostObjectives)
        ? value.lostObjectives
        : [],
      migratingNpcs: Array.isArray(value?.migratingNpcs)
        ? value.migratingNpcs
        : [],
      deprecatedPois: Array.isArray(value?.deprecatedPois)
        ? value.deprecatedPois
        : [],
    };
  }

  private isConditionSatisfied(
    condition: Record<string, unknown>,
    facts: GateFacts,
  ): boolean {
    const naturalLanguage = this.stringOrNull(condition.naturalLanguage);
    if (naturalLanguage) {
      const conditionKey =
        this.stringOrNull(condition.conditionKey) ??
        this.stringOrNull(condition.key) ??
        this.normalizeConditionKey(naturalLanguage);
      return Boolean(
        conditionKey && facts.nlTriggerSatisfiedKeys?.has(conditionKey),
      );
    }

    const entries = Object.entries(condition);
    if (entries.length === 0) return false;
    return entries.every(([kind, value]) => {
      const id = typeof value === "string" ? value : null;
      switch (kind) {
        case "always":
          return value === true;
        case "quest_completed":
          if (id === "main") return facts.mainQuestCompleted === true;
          return Boolean(id && facts.questStatuses?.get(id) === "completed");
        case "objective_completed":
          return Boolean(
            id && facts.objectiveStatuses?.get(id) === "completed",
          );
        case "objective_progressed":
          if (id === "any") {
            return [...(facts.objectiveProgress?.values() ?? [])].some(
              (progress) => progress > 0,
            );
          }
          return Boolean(
            id &&
            ((facts.objectiveProgress?.get(id) ?? 0) > 0 ||
              facts.objectiveStatuses?.get(id) === "completed"),
          );
        case "clock_filled":
          return this.hasFact(id, facts.clockFilledIds, facts.clockFilledKeys);
        case "decision_made":
          return this.hasFact(id, facts.decisionIds, facts.decisionKeys);
        case "location_visited":
          return this.hasFact(
            id,
            facts.locationVisitedIds,
            facts.locationVisitedKeys,
          );
        case "combat_encounter_completed":
          return this.hasFact(
            id,
            facts.combatCompletedIds,
            facts.combatCompletedKeys,
          );
        case "arc_beat_reached":
          return Boolean(id && facts.arcBeatsReached?.has(id));
        default:
          return false;
      }
    });
  }

  private stringOrNull(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private normalizeConditionKey(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
  }

  private toPhaseDto(phase: PhaseEntity): PhaseDto {
    return {
      id: phase.id,
      storyArcId: phase.storyArcId,
      index: phase.index,
      name: phase.name,
      description: phase.description ?? null,
      emotionalArc: phase.emotionalArc,
      arcBeats: phase.arcBeats ?? [],
      unlockConditions: phase.unlockConditions,
      completionConditions: phase.completionConditions,
      transitionBeatNarrativeSeed: phase.transitionBeatNarrativeSeed ?? null,
      deprecatesOnAdvance: this.normalizeDeprecates(phase.deprecatesOnAdvance),
      isReversible: phase.isReversible,
      createdAt: phase.createdAt.toISOString(),
      updatedAt: phase.updatedAt.toISOString(),
    };
  }

  private indexToLegacyPhase(
    index: number,
  ): SessionStoryArcStateEntity["currentPhase"] {
    if (index <= 1) return "hook";
    if (index === 2) return "development";
    if (index === 3) return "climax";
    return "resolution";
  }

  private async publishMainQuestAssigned(
    sessionId: string,
    campaignId: string,
    quest: QuestEntity,
  ): Promise<void> {
    const envelope = this.envelopeFactory.build({
      eventCategory: "WorldEvent",
      eventType: "main_quest_assigned",
      source: {
        service: "diad-backend",
        module: "PhaseService.bootstrapStoryFirst",
      },
      scope: { campaignId, sessionId },
      payload: {
        questId: quest.id,
        questName: quest.name,
        storyArcId: quest.storyArcId,
      },
      audiences: STORY_AUDIENCES,
      narrativeDescriptor: `Missão principal definida: ${quest.name}`,
    });
    await this.eventBus.publish(envelope);
  }

  private async publishPhaseGatePending(
    session: GameSessionEntity,
    fromPhase: PhaseEntity,
    toPhase: PhaseEntity,
    pending: PhaseGatePendingPayload,
    traceId?: string,
  ): Promise<void> {
    if (!session.campaignId) return;
    const envelope = this.envelopeFactory.build({
      eventCategory: "WorldEvent",
      eventType: "phase_gate_pending",
      source: {
        service: "diad-backend",
        module: "PhaseService.advancePhase",
        traceId,
      },
      scope: { campaignId: session.campaignId, sessionId: session.id },
      payload: {
        fromPhaseIndex: fromPhase.index,
        toPhaseIndex: toPhase.index,
        pending,
      },
      audiences: STORY_AUDIENCES,
      narrativeDescriptor: pending.narrativeDescriptor,
    });
    await this.eventBus.publish(envelope);
  }

  private async publishPhaseChanged(
    session: GameSessionEntity,
    fromPhase: PhaseEntity,
    toPhase: PhaseEntity,
    transition: PhaseTransitionEntity,
    traceId?: string,
  ): Promise<void> {
    if (!session.campaignId) return;
    const bookendDecision = await this.buildBookendDecisionPayload(
      session,
      transition,
    );
    const envelope = this.envelopeFactory.build({
      eventCategory: "WorldEvent",
      eventType: "phase_changed",
      source: {
        service: "diad-backend",
        module: "PhaseService.advancePhase",
        traceId,
      },
      scope: { campaignId: session.campaignId, sessionId: session.id },
      payload: {
        phaseTransitionId: transition.id,
        fromPhase: this.toPhaseDto(fromPhase),
        toPhase: this.toPhaseDto(toPhase),
        chaosFactor: session.chaosFactor,
        transitionBeatNarrativeSeed:
          toPhase.transitionBeatNarrativeSeed ?? null,
        ...bookendDecision,
      },
      audiences: STORY_AUDIENCES,
      narrativeDescriptor:
        toPhase.transitionBeatNarrativeSeed ??
        `A história avançou para ${toPhase.name}.`,
    });
    await this.eventBus.publish(envelope);
  }

  private async buildBookendDecisionPayload(
    session: GameSessionEntity,
    transition: PhaseTransitionEntity,
  ): Promise<{
    gapMinutes: number;
    sceneNumber: number;
    crossDay: boolean;
    phaseChangedSinceLastSession: boolean;
    previouslySeen: boolean;
  }> {
    const [lastScene, lastMessage, previouslyCount] = await Promise.all([
      this.dataSource.getRepository(SceneEntity).findOne({
        where: { sessionId: session.id, isActive: true },
        order: { sceneNumber: "DESC" },
        select: ["sceneNumber"],
      }),
      this.dataSource.getRepository(SessionMessageEntity).findOne({
        where: { sessionId: session.id },
        order: { sequenceNumber: "DESC" },
        select: ["createdAt"],
      }),
      this.bookendArtifactRepo?.count({
        where: {
          gameSessionId: session.id,
          phaseTransitionId: transition.id,
          kind: "previously_on",
        },
      }) ?? Promise.resolve(0),
    ]);

    const lastActivityAt = lastMessage?.createdAt ?? session.updatedAt;
    const gapMinutes = calculateGapMinutes(lastActivityAt);
    const crossDay = isDifferentUtcDay(lastActivityAt, new Date());

    return {
      gapMinutes,
      sceneNumber: lastScene?.sceneNumber ?? 2,
      crossDay,
      phaseChangedSinceLastSession:
        gapMinutes >= PREVIOUSLY_ON_GAP_MINUTES || crossDay,
      previouslySeen: previouslyCount > 0,
    };
  }
}

function calculateGapMinutes(
  lastActivityAt: Date | string | undefined,
): number {
  if (!lastActivityAt) return 0;
  const last = new Date(lastActivityAt).getTime();
  if (!Number.isFinite(last)) return 0;
  return Math.max(0, Math.round((Date.now() - last) / 60_000));
}

function isDifferentUtcDay(
  left: Date | string | undefined,
  right: Date,
): boolean {
  if (!left) return false;
  const date = new Date(left);
  if (!Number.isFinite(date.getTime())) return false;
  return (
    date.getUTCFullYear() !== right.getUTCFullYear() ||
    date.getUTCMonth() !== right.getUTCMonth() ||
    date.getUTCDate() !== right.getUTCDate()
  );
}