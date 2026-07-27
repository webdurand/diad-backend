import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { MonsterEntity } from "src/entities/monster.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import {
  AARAKOCRA_RITUAL_SIZE,
  AARAKOCRA_RITUAL_SUMMON_SOURCE,
  SummonSpawnDto,
} from "../interfaces/summoning.interfaces";
import { getAbilityModifier } from "src/shared/srd-utils";
import {
  failure,
  GameErrorCode,
  success,
  type GameEventData,
  type GameResult,
} from "../interfaces/result.type";
import { chebyshevDistanceFt } from "./combat-range";
import { getSummonMetadata, isFindFamiliarSummon } from "./summon-stat-block";

type SummonDismissReason =
  | "player-dismiss"
  | "form-change"
  | "caster-death"
  | "concentration-broken"
  | "duration-end"
  | "hp-zero";

interface SummonDismissResult {
  removed: boolean;
  events: GameEventData[];
}

export interface AarakocraRitualDismissResult {
  actorParticipantId: string;
  summonParticipantId: string;
  ritualParticipantIds: string[];
  actionConsumed: false;
  bonusActionConsumed: true;
  dismissed: true;
}

export interface SummonDurationTickResult {
  tracked: boolean;
  removed: boolean;
  remaining: number | null;
  events: GameEventData[];
}

export interface FamiliarActionResult {
  casterParticipantId: string;
  familiarParticipantId: string;
  familiarName: string;
  pocketed: boolean;
  position?: { x: number; y: number };
}


@Injectable()
export class SummoningService {
  private readonly logger = new Logger(SummoningService.name);

  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(MonsterEntity)
    private readonly monsterRepo: Repository<MonsterEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
  ) {}


  async spawnSummon(
    encounterId: string,
    dto: SummonSpawnDto,
  ): Promise<EncounterParticipantEntity> {
    const caster = await this.participantRepo.findOne({
      where: { id: dto.casterParticipantId },
    });
    if (!caster) {
      throw new NotFoundException(
        `caster participant ${dto.casterParticipantId} not found`,
      );
    }
    if (caster.encounterId !== encounterId) {
      throw new BadRequestException(
        "caster participant n\u00e3o pertence a este encounter",
      );
    }
    const monster = await this.monsterRepo.findOne({
      where: { slug: dto.monsterSlug },
    });
    if (!monster) {
      throw new NotFoundException(`monster ${dto.monsterSlug} n\u00e3o existe`);
    }

    const summon = new EncounterParticipantEntity();
    const spawnPosition = await this.resolveSpawnPosition(
      encounterId,
      caster,
      dto.position,
    );
    summon.encounterId = encounterId;
    summon.type = "monster";
    summon.monsterId = monster.id;
    summon.monster = monster;
    summon.displayName = dto.displayName ?? monster.name;
    summon.faction = dto.faction ?? caster.faction ?? "ally";
    summon.currentHp = dto.statBlock?.maxHp ?? monster.hit_points;
    summon.maxHp = dto.statBlock?.maxHp ?? monster.hit_points;
    summon.tempHp = 0;
    summon.initiativeModifier = getAbilityModifier(
      Number((monster as any).dexterity ?? 10),
    );
    summon.initiativeRoll = undefined;
    summon.initiativeTotal = caster.initiativeTotal ?? 0;
    summon.positionX = spawnPosition.x;
    summon.positionY = spawnPosition.y;
    summon.isVisible = true;
    summon.isDefeated = false;
    summon.dyingState = "none";
    summon.actionUsed = false;
    summon.bonusActionUsed = false;
    summon.hasDashed = false;
    summon.hasDisengaged = false;
    summon.reactionsUsed = 0;
    summon.conditions = [];
    summon.conditionInstances = [];
    const durationRoundsTotal =
      dto.durationRoundsTotal == null
        ? null
        : Math.max(0, Math.trunc(dto.durationRoundsTotal));
    summon.appliedEffects = [
      {
        kind: "summon",
        refId: dto.source,
        targetParticipantId: summon.id ?? null,
        description: dto.statBlock
          ? `${dto.statBlock.kind}:${dto.statBlock.form}`
          : dto.source,
        metadata: {
          source: dto.source,
          ...(dto.metadata ?? {}),
          ...(durationRoundsTotal != null
            ? {
                durationRoundsTotal,
                durationRoundsRemaining: durationRoundsTotal,
                durationCycleStarted: false,
              }
            : {}),
          ...(dto.statBlock ? { statBlock: dto.statBlock } : {}),
        },
      },
    ];
    summon.effectInstances = [];
    summon.spellSlotsUsed = {};
    summon.rechargeState = {};
    summon.legendaryActionsUsed = 0;
    summon.freeObjectInteractionsUsed = 0;
    summon.attacksUsedThisTurn = 0;
    summon.attacksMaxThisTurn = 1;
    summon.recklessAttackActive = false;
    summon.cleaveUsedThisTurn = false;
    summon.nickUsedThisTurn = false;
    summon.sneakAttackUsedThisTurn = false;
    summon.tacticalMasterOverride = null;
    summon.inspirationArmed = false;
    summon.superiorityDiceUsed = 0;
    summon.relentlessRageUsesUsed = 0;
    summon.sorceryPointsUsed = 0;
    summon.sorcerousRestorationUsed = false;
    summon.indomitableArmed = false;
    summon.dodgingUntilTurnOfParticipantId = null;
    summon.helpingAllyParticipantId = null;
    summon.helpingTargetParticipantId = null;
    summon.helpingUntilTurnOfParticipantId = null;
    summon.readiedAction = null;
    summon.lastAiTurnRound = null;
    summon.lastAiTurnResult = null;
    summon.controlledBy = this.resolveControlledBy(caster, dto);
    summon.concentrationRoundsRemaining = null;
    summon.concentrationSaveDc = null;
    summon.isConcentrating = false;
    summon.grappledByParticipantId = null;
    summon.transformationState = null;
    summon.linkedCasterParticipantId = caster.id;

    const saved = await this.participantRepo.save(summon);
    await this.addSummonToTurnOrder(encounterId, caster, saved, dto);
    if (dto.concentrationLinked) {
      await this.trackConcentrationSummon(caster, saved, dto);
    }
    this.logger.log(
      `[summoning] ${dto.source} \u2192 ${monster.name} (id=${saved.id}, caster=${caster.id}, faction=${summon.faction})`,
    );
    return saved;
  }

  private async resolveSpawnPosition(
    encounterId: string,
    caster: EncounterParticipantEntity,
    requested?: { x: number; y: number },
  ): Promise<{ x: number; y: number }> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) {
      throw new NotFoundException(`encounter ${encounterId} not found`);
    }

    const gridColumns =
      encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
    const gridRows =
      encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
    const participants = await this.participantRepo.find({
      where: { encounterId },
    });
    const occupied = new Set(
      [...participants, caster]
        .filter(
          (participant) =>
            !participant.isDefeated &&
            participant.positionX != null &&
            participant.positionY != null,
        )
        .map(
          (participant) =>
            `${participant.positionX as number},${participant.positionY as number}`,
        ),
    );
    const origin = {
      x: caster.positionX ?? 0,
      y: caster.positionY ?? 0,
    };
    const preferred = requested ?? { x: origin.x + 1, y: origin.y };
    const isAvailable = (x: number, y: number) =>
      x >= 0 &&
      x < gridColumns &&
      y >= 0 &&
      y < gridRows &&
      !occupied.has(`${x},${y}`);

    if (isAvailable(preferred.x, preferred.y)) return preferred;

    const maxRadius = Math.max(gridColumns, gridRows);
    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let y = origin.y - radius; y <= origin.y + radius; y++) {
        for (let x = origin.x - radius; x <= origin.x + radius; x++) {
          if (Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) !== radius)
            continue;
          if (isAvailable(x, y)) return { x, y };
        }
      }
    }

    throw new BadRequestException(
      "Não há uma célula livre no mapa para materializar a invocação.",
    );
  }


  async dismissSummon(
    summonParticipantId: string,
    reason: SummonDismissReason,
    actorParticipantId?: string,
    eventData?: Record<string, unknown>,
  ): Promise<SummonDismissResult> {
    const summon = await this.participantRepo.findOne({
      where: { id: summonParticipantId },
    });
    if (!summon || !summon.linkedCasterParticipantId) {
      return { removed: false, events: [] };
    }
    await this.removeSummonFromTurnOrder(summon);
    await this.participantRepo.remove(summon);
    this.logger.log(
      `[summoning] dismissed ${summonParticipantId} (reason=${reason})`,
    );
    return {
      removed: true,
      events: [
        {
          event_type: "summon_dismissed",
          target_participant_id: summon.id,
          actor_participant_id:
            actorParticipantId ?? summon.linkedCasterParticipantId,
          data: {
            reason,
            summonId: summon.id,
            displayName: summon.displayName,
            ...(eventData ?? {}),
          },
        },
      ],
    };
  }

  async tickSummonDurationAfterTurn(
    summonParticipantId: string,
  ): Promise<SummonDurationTickResult> {
    const summon = await this.participantRepo.findOne({
      where: { id: summonParticipantId },
    });
    if (!summon?.linkedCasterParticipantId) {
      return {
        tracked: false,
        removed: false,
        remaining: null,
        events: [],
      };
    }
    const metadata = getSummonMetadata(summon);
    if (metadata?.source !== AARAKOCRA_RITUAL_SUMMON_SOURCE) {
      return {
        tracked: false,
        removed: false,
        remaining: null,
        events: [],
      };
    }
    const total = this.nonNegativeInteger(metadata?.durationRoundsTotal);
    if (total == null) {
      return {
        tracked: false,
        removed: false,
        remaining: null,
        events: [],
      };
    }
    const remaining =
      this.nonNegativeInteger(metadata?.durationRoundsRemaining) ?? total;
    if (remaining <= 0) {
      const dismissed = await this.dismissSummon(
        summon.id,
        "duration-end",
        undefined,
        {
          durationRoundsTotal: total,
          durationRoundsRemaining: 0,
        },
      );
      return {
        tracked: true,
        removed: dismissed.removed,
        remaining: 0,
        events: dismissed.events,
      };
    }
    const nextRemaining = Math.max(0, remaining - 1);
    if (nextRemaining === 0) {
      const dismissed = await this.dismissSummon(
        summon.id,
        "duration-end",
        undefined,
        {
          durationRoundsTotal: total,
          durationRoundsRemaining: 0,
        },
      );
      return {
        tracked: true,
        removed: dismissed.removed,
        remaining: 0,
        events: dismissed.events,
      };
    }
    this.patchSummonMetadata(summon, {
      durationRoundsTotal: total,
      durationRoundsRemaining: nextRemaining,
      durationCycleStarted: true,
    });
    await this.participantRepo.save(summon);
    return {
      tracked: true,
      removed: false,
      remaining: nextRemaining,
      events: [],
    };
  }

  async findAarakocraRitualSummonForMember(
    encounterId: string,
    participantId: string,
  ): Promise<EncounterParticipantEntity | null> {
    const participants = await this.participantRepo.find({
      where: { encounterId },
    });
    return (
      participants.find((candidate) => {
        const group = this.getAarakocraRitualGroup(candidate);
        return (
          group != null &&
          group.participantIds.includes(participantId) &&
          !candidate.isDefeated &&
          (candidate.currentHp ?? 1) > 0
        );
      }) ?? null
    );
  }

  async dismissAarakocraAirElemental(
    encounterId: string,
    summonParticipantId: string,
    actorParticipantId: string,
  ): Promise<GameResult<AarakocraRitualDismissResult>> {
    const result = await this.encounterRepo.manager.transaction(
      async (manager) => {
        const encounterRepo = manager.getRepository(EncounterEntity);
        const participantRepo = manager.getRepository(
          EncounterParticipantEntity,
        );
        const encounter = await encounterRepo.findOne({
          where: { id: encounterId },
          lock: { mode: "pessimistic_write" },
        });
        if (!encounter || encounter.status !== "active") {
          return failure(
            "Encontro não está ativo.",
            GameErrorCode.ENCOUNTER_NOT_ACTIVE,
          );
        }

        const summon = await participantRepo.findOne({
          where: { id: summonParticipantId, encounterId },
          lock: { mode: "pessimistic_write" },
        });
        const group = this.getAarakocraRitualGroup(summon);
        if (!summon || !group) {
          return failure(
            "O Air Elemental ritual não está disponível neste encontro.",
            GameErrorCode.INVALID_ACTION,
          );
        }
        const actor = await participantRepo.findOne({
          where: { id: actorParticipantId, encounterId },
          lock: { mode: "pessimistic_write" },
        });
        if (!actor || !group.participantIds.includes(actor.id)) {
          return failure(
            "Somente um dos cinco ritualistas pode dispensar o Air Elemental.",
            GameErrorCode.FORBIDDEN,
          );
        }
        if (
          actor.isDefeated ||
          actor.dyingState === "dead" ||
          (actor.currentHp ?? 1) <= 0
        ) {
          return failure(
            "Um ritualista morto ou derrotado não pode dispensar a invocação.",
            GameErrorCode.INVALID_ACTION,
          );
        }
        if (encounter.turnOrder[encounter.currentTurnIndex] !== actor.id) {
          return failure(
            "Não é o turno deste ritualista.",
            GameErrorCode.NOT_YOUR_TURN,
          );
        }
        if (actor.bonusActionUsed) {
          return failure(
            "A ação bônus já foi utilizada neste turno.",
            GameErrorCode.NO_BONUS_ACTION_AVAILABLE,
          );
        }
        if (this.hasActionBlockingCondition(actor)) {
          return failure(
            "Uma condição impede o ritualista de usar ações.",
            GameErrorCode.CONDITION_PREVENTS_ACTION,
          );
        }

        const summonId = summon.id;
        const summonName = summon.displayName;
        actor.bonusActionUsed = true;
        this.removeParticipantFromEncounterTurnOrder(encounter, summonId);
        await participantRepo.save(actor);
        await encounterRepo.save(encounter);
        await participantRepo.remove(summon);

        const events: GameEventData[] = [
          {
            event_type: "summon_dismissed",
            target_participant_id: summonId,
            actor_participant_id: actor.id,
            data: {
              reason: "player-dismiss",
              summonId,
              displayName: summonName,
              source: AARAKOCRA_RITUAL_SUMMON_SOURCE,
              ritualParticipantIds: group.participantIds,
              ritualParticipantNames: group.participantNames,
              actionConsumed: false,
              bonusActionConsumed: true,
            },
          },
        ];
        return success<AarakocraRitualDismissResult>(
          {
            actorParticipantId: actor.id,
            summonParticipantId: summonId,
            ritualParticipantIds: group.participantIds,
            actionConsumed: false,
            bonusActionConsumed: true,
            dismissed: true,
          },
          events,
        );
      },
    );
    if (result.ok) {
      this.logger.log(
        `[summoning] dismissed ${summonParticipantId} (reason=player-dismiss)`,
      );
    }
    return result;
  }

  async reconcileAarakocraRitualSummons(
    encounterId: string,
  ): Promise<GameEventData[]> {
    const participants = await this.participantRepo.find({
      where: { encounterId },
    });
    const byId = new Map(
      participants.map((participant) => [participant.id, participant]),
    );
    const events: GameEventData[] = [];
    for (const summon of participants) {
      const group = this.getAarakocraRitualGroup(summon);
      if (!group) continue;
      const livingCount = group.participantIds.reduce((count, id) => {
        const ritualist = byId.get(id);
        return this.isRitualistAlive(ritualist) ? count + 1 : count;
      }, 0);
      if (livingCount > 0) continue;
      const dismissed = await this.dismissSummon(
        summon.id,
        "caster-death",
        summon.linkedCasterParticipantId ?? undefined,
        {
          source: AARAKOCRA_RITUAL_SUMMON_SOURCE,
          ritualParticipantIds: group.participantIds,
          ritualParticipantNames: group.participantNames,
          livingRitualistCount: 0,
        },
      );
      events.push(...dismissed.events);
    }
    return events;
  }


  async getSummonsOf(
    casterParticipantId: string,
  ): Promise<EncounterParticipantEntity[]> {
    return this.participantRepo.find({
      where: { linkedCasterParticipantId: casterParticipantId },
    });
  }

  async getFindFamiliarOf(
    casterParticipantId: string,
  ): Promise<EncounterParticipantEntity | null> {
    const summons = await this.getSummonsOf(casterParticipantId);
    return summons.find((candidate) => isFindFamiliarSummon(candidate)) ?? null;
  }

  async shareFamiliarSenses(
    encounterId: string,
    casterParticipantId: string,
  ): Promise<GameResult<FamiliarActionResult>> {
    const context = await this.getFamiliarActionContext(
      encounterId,
      casterParticipantId,
    );
    if (!context.ok) return context.result;
    const { caster, familiar } = context;
    if (
      !familiar.isVisible ||
      familiar.isDefeated ||
      getSummonMetadata(familiar)?.pocketed === true
    ) {
      return failure(
        "O familiar precisa estar presente para compartilhar os sentidos.",
        "INVALID_ACTION",
      );
    }
    if (
      caster.positionX == null ||
      caster.positionY == null ||
      familiar.positionX == null ||
      familiar.positionY == null
    ) {
      return failure(
        "O familiar precisa estar posicionado no mapa.",
        "INVALID_ACTION",
      );
    }
    const distanceFt = chebyshevDistanceFt(
      { x: caster.positionX, y: caster.positionY },
      { x: familiar.positionX, y: familiar.positionY },
    );
    if (distanceFt > 100) {
      return failure(
        `O familiar está fora do alcance telepático (${distanceFt}ft > 100ft).`,
        "OUT_OF_RANGE",
      );
    }

    caster.effectInstances = (caster.effectInstances ?? []).filter(
      (effect) =>
        !(
          effect.kind === "familiar_shared_senses" &&
          effect.sourceCasterParticipantId === caster.id
        ),
    );
    const effect = {
      id: randomUUID(),
      sourceSpellSlug: "find-familiar",
      sourceCasterParticipantId: caster.id,
      kind: "familiar_shared_senses" as const,
      payload: {
        familiarParticipantId: familiar.id,
        familiarName: familiar.displayName,
      },
      expiresAt: { kind: "until_caster_turn" as const },
      requiresConcentration: false,
      appliedAt: new Date().toISOString(),
    };
    caster.effectInstances = [...caster.effectInstances, effect];
    caster.actionUsed = true;
    await this.participantRepo.save(caster);

    return success(
      {
        casterParticipantId: caster.id,
        familiarParticipantId: familiar.id,
        familiarName: familiar.displayName,
        pocketed: false,
        position: { x: familiar.positionX, y: familiar.positionY },
      },
      [
        {
          event_type: "effect_applied",
          actor_participant_id: caster.id,
          target_participant_id: caster.id,
          data: {
            effectId: effect.id,
            kind: effect.kind,
            sourceSpellSlug: "find-familiar",
            payload: effect.payload,
            expiresAt: effect.expiresAt,
            requiresConcentration: false,
          },
        },
        {
          event_type: "familiar_senses_shared",
          actor_participant_id: caster.id,
          target_participant_id: familiar.id,
          data: {
            familiarName: familiar.displayName,
            distanceFt,
            expiresAt: "start_of_caster_next_turn",
          },
        },
      ],
    );
  }

  async pocketFindFamiliar(
    encounterId: string,
    casterParticipantId: string,
  ): Promise<GameResult<FamiliarActionResult>> {
    const context = await this.getFamiliarActionContext(
      encounterId,
      casterParticipantId,
    );
    if (!context.ok) return context.result;
    const { caster, familiar } = context;
    if (
      !familiar.isVisible ||
      getSummonMetadata(familiar)?.pocketed === true
    ) {
      return failure(
        "O familiar já está no bolsão dimensional.",
        "INVALID_ACTION",
      );
    }

    const previousPosition =
      familiar.positionX != null && familiar.positionY != null
        ? { x: familiar.positionX, y: familiar.positionY }
        : undefined;
    this.setFamiliarPocketed(familiar, true);
    familiar.isVisible = false;
    familiar.positionX = null;
    familiar.positionY = null;
    caster.actionUsed = true;
    await this.participantRepo.save([caster, familiar]);
    await this.removeSummonFromTurnOrder(familiar);

    return success(
      {
        casterParticipantId: caster.id,
        familiarParticipantId: familiar.id,
        familiarName: familiar.displayName,
        pocketed: true,
      },
      [
        {
          event_type: "familiar_pocketed",
          actor_participant_id: caster.id,
          target_participant_id: familiar.id,
          data: {
            familiarName: familiar.displayName,
            previousPosition,
          },
        },
      ],
    );
  }

  async reappearFindFamiliar(
    encounterId: string,
    casterParticipantId: string,
    position: { x: number; y: number },
  ): Promise<GameResult<FamiliarActionResult>> {
    const context = await this.getFamiliarActionContext(
      encounterId,
      casterParticipantId,
    );
    if (!context.ok) return context.result;
    const { encounter, caster, familiar } = context;
    if (getSummonMetadata(familiar)?.pocketed !== true) {
      return failure(
        "O familiar já está presente no plano atual.",
        "INVALID_ACTION",
      );
    }
    if (caster.positionX == null || caster.positionY == null) {
      return failure(
        "O conjurador precisa estar posicionado no mapa.",
        "INVALID_ACTION",
      );
    }

    const x = Math.trunc(position.x);
    const y = Math.trunc(position.y);
    const columns =
      encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
    const rows =
      encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
    if (x < 0 || y < 0 || x >= columns || y >= rows) {
      return failure(
        "Escolha um espaço dentro do mapa.",
        "POSITION_OUT_OF_BOUNDS",
      );
    }
    const distanceFt = chebyshevDistanceFt(
      { x: caster.positionX, y: caster.positionY },
      { x, y },
    );
    if (distanceFt > 30) {
      return failure(
        `O familiar só pode reaparecer a até 30 pés (${distanceFt}ft).`,
        "OUT_OF_RANGE",
      );
    }
    const occupant = await this.participantRepo.findOne({
      where: {
        encounterId,
        positionX: x,
        positionY: y,
        isDefeated: false,
      },
    });
    if (occupant) {
      return failure(
        `O espaço está ocupado por ${occupant.displayName}.`,
        "POSITION_OCCUPIED",
      );
    }

    this.setFamiliarPocketed(familiar, false);
    familiar.isVisible = true;
    familiar.positionX = x;
    familiar.positionY = y;
    familiar.reactionsUsed = 0;
    caster.actionUsed = true;
    await this.participantRepo.save([caster, familiar]);
    await this.addSummonToTurnOrder(encounterId, caster, familiar, {
      casterParticipantId: caster.id,
      monsterSlug: familiar.monster?.slug ?? "familiar",
      source: "find-familiar-spell",
      controlMode: "own-initiative",
    });

    return success(
      {
        casterParticipantId: caster.id,
        familiarParticipantId: familiar.id,
        familiarName: familiar.displayName,
        pocketed: false,
        position: { x, y },
      },
      [
        {
          event_type: "familiar_reappeared",
          actor_participant_id: caster.id,
          target_participant_id: familiar.id,
          data: {
            familiarName: familiar.displayName,
            position: { x, y },
            distanceFt,
          },
        },
      ],
    );
  }


  async dismissAllOfCaster(
    casterParticipantId: string,
    reason: "caster-death" | "concentration-broken",
  ): Promise<number> {
    const summons = await this.getSummonsOf(casterParticipantId);
    await Promise.all(summons.map((s) => this.dismissSummon(s.id, reason)));
    return summons.length;
  }

  private async getFamiliarActionContext(
    encounterId: string,
    casterParticipantId: string,
  ): Promise<
    | {
        ok: true;
        encounter: EncounterEntity;
        caster: EncounterParticipantEntity;
        familiar: EncounterParticipantEntity;
      }
    | { ok: false; result: GameResult<FamiliarActionResult> }
  > {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return {
        ok: false,
        result: failure("Encontro não está ativo.", "ENCOUNTER_NOT_ACTIVE"),
      };
    }
    const caster = await this.participantRepo.findOne({
      where: { id: casterParticipantId, encounterId },
    });
    if (!caster) {
      return {
        ok: false,
        result: failure(
          "Conjurador não encontrado no encontro.",
          "PARTICIPANT_NOT_FOUND",
        ),
      };
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== caster.id) {
      return {
        ok: false,
        result: failure(
          "Não é o turno deste participante.",
          "NOT_YOUR_TURN",
        ),
      };
    }
    if (caster.actionUsed) {
      return {
        ok: false,
        result: failure(
          "Ação já utilizada neste turno.",
          "NO_ACTION_AVAILABLE",
        ),
      };
    }
    if (
      (caster.conditions ?? []).some((condition) =>
        [
          "incapacitated",
          "stunned",
          "paralyzed",
          "petrified",
          "unconscious",
          "haste_lethargy",
          "hypnotized",
        ].includes(condition),
      )
    ) {
      return {
        ok: false,
        result: failure(
          "Uma condição impede o conjurador de usar ações.",
          "CONDITION_PREVENTS_ACTION",
        ),
      };
    }
    const familiar = await this.getFindFamiliarOf(caster.id);
    if (!familiar || familiar.encounterId !== encounterId) {
      return {
        ok: false,
        result: failure(
          "Nenhum familiar vinculado está disponível.",
          "INVALID_ACTION",
        ),
      };
    }
    return { ok: true, encounter, caster, familiar };
  }

  private setFamiliarPocketed(
    familiar: EncounterParticipantEntity,
    pocketed: boolean,
  ): void {
    familiar.appliedEffects = (familiar.appliedEffects ?? []).map((effect) =>
      effect.kind === "summon"
        ? {
            ...effect,
            metadata: {
              ...(effect.metadata ?? {}),
              pocketed,
            },
          }
        : effect,
    );
  }

  private resolveControlledBy(
    caster: EncounterParticipantEntity,
    dto: SummonSpawnDto,
  ): "pc" | "ai" | "dm" {
    if (dto.controlMode === "ai-controlled") return "ai";
    return caster.controlledBy ?? "pc";
  }

  private getAarakocraRitualGroup(
    participant: EncounterParticipantEntity | null | undefined,
  ): { participantIds: string[]; participantNames: string[] } | null {
    const metadata = getSummonMetadata(participant);
    if (metadata?.source !== AARAKOCRA_RITUAL_SUMMON_SOURCE) return null;
    if (!Array.isArray(metadata.ritualParticipantIds)) return null;
    const participantIds = metadata.ritualParticipantIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    if (
      participantIds.length !== AARAKOCRA_RITUAL_SIZE ||
      new Set(participantIds).size !== AARAKOCRA_RITUAL_SIZE
    ) {
      return null;
    }
    const persistedNames = Array.isArray(metadata.ritualParticipantNames)
      ? metadata.ritualParticipantNames.filter(
          (name): name is string => typeof name === "string" && name.length > 0,
        )
      : [];
    return {
      participantIds,
      participantNames: participantIds.map(
        (id, index) => persistedNames[index] ?? id,
      ),
    };
  }

  private isRitualistAlive(
    participant: EncounterParticipantEntity | null | undefined,
  ): boolean {
    if (!participant || participant.dyingState === "dead") return false;
    if (participant.type === "pc") {
      return true;
    }
    return (
      participant.isDefeated !== true && (participant.currentHp ?? 1) > 0
    );
  }

  private patchSummonMetadata(
    summon: EncounterParticipantEntity,
    patch: Record<string, unknown>,
  ): void {
    let patched = false;
    summon.appliedEffects = (summon.appliedEffects ?? []).map((effect) => {
      if (patched || effect.kind !== "summon") return effect;
      patched = true;
      return {
        ...effect,
        metadata: {
          ...(effect.metadata ?? {}),
          ...patch,
        },
      };
    });
  }

  private nonNegativeInteger(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.trunc(value))
      : null;
  }

  private hasActionBlockingCondition(
    participant: EncounterParticipantEntity,
  ): boolean {
    return (participant.conditions ?? []).some((condition) =>
      [
        "incapacitated",
        "stunned",
        "paralyzed",
        "petrified",
        "unconscious",
        "haste_lethargy",
        "hypnotized",
      ].includes(condition),
    );
  }

  private async addSummonToTurnOrder(
    encounterId: string,
    caster: EncounterParticipantEntity,
    summon: EncounterParticipantEntity,
    dto: SummonSpawnDto,
  ): Promise<void> {
    const controlMode = dto.controlMode ?? "own-initiative";
    if (controlMode === "shared-turn") return;

    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") return;

    encounter.turnOrder = encounter.turnOrder ?? [];
    if (encounter.turnOrder.includes(summon.id)) return;

    const casterIndex = encounter.turnOrder.indexOf(caster.id);
    const insertIndex =
      casterIndex >= 0 ? casterIndex + 1 : encounter.currentTurnIndex + 1;
    const boundedIndex = Math.max(
      0,
      Math.min(insertIndex, encounter.turnOrder.length),
    );

    if (boundedIndex <= encounter.currentTurnIndex) {
      encounter.currentTurnIndex += 1;
    }
    encounter.turnOrder.splice(boundedIndex, 0, summon.id);
    await this.encounterRepo.save(encounter);
  }

  private async removeSummonFromTurnOrder(
    summon: EncounterParticipantEntity,
  ): Promise<void> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: summon.encounterId },
    });
    if (!encounter || !Array.isArray(encounter.turnOrder)) return;

    if (!this.removeParticipantFromEncounterTurnOrder(encounter, summon.id)) {
      return;
    }
    await this.encounterRepo.save(encounter);
  }

  private removeParticipantFromEncounterTurnOrder(
    encounter: EncounterEntity,
    participantId: string,
  ): boolean {
    if (!Array.isArray(encounter.turnOrder)) return false;
    const removeIndex = encounter.turnOrder.indexOf(participantId);
    if (removeIndex < 0) return false;

    encounter.turnOrder = encounter.turnOrder.filter(
      (id) => id !== participantId,
    );
    if (removeIndex < encounter.currentTurnIndex) {
      encounter.currentTurnIndex = Math.max(0, encounter.currentTurnIndex - 1);
    } else if (removeIndex === encounter.currentTurnIndex) {
      encounter.currentTurnIndex = Math.min(
        encounter.currentTurnIndex,
        Math.max(0, encounter.turnOrder.length - 1),
      );
    }
    return true;
  }

  private async trackConcentrationSummon(
    caster: EncounterParticipantEntity,
    summon: EncounterParticipantEntity,
    dto: SummonSpawnDto,
  ): Promise<void> {
    caster.appliedEffects = [
      ...(caster.appliedEffects ?? []),
      {
        kind: "summon",
        refId: summon.id,
        targetParticipantId: summon.id,
        description: `${dto.source}:${summon.displayName}`,
        metadata: {
          source: dto.source,
          concentrationBreakBehavior:
            dto.concentrationBreakBehavior ?? "dismiss",
        },
      },
    ];
    await this.participantRepo.save(caster);
  }
}
