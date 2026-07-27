import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { Repository } from "typeorm";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type { EffectInstance } from "../interfaces/combat.interfaces";
import {
  failure,
  GameErrorCode,
  GameEventData,
  GameResult,
  success,
} from "../interfaces/result.type";
import { ConcentrationService } from "./concentration.service";
import { SummoningService } from "./summoning.service";
import {
  AARAKOCRA_RITUAL_ACTION_ID,
  AARAKOCRA_RITUAL_SIZE,
  AARAKOCRA_RITUAL_SUMMON_SOURCE,
} from "../interfaces/summoning.interfaces";

const RITUAL_ACTION_ID = AARAKOCRA_RITUAL_ACTION_ID;
const RITUAL_EFFECT_KIND = "summoning_ritual" as const;
const RITUAL_SIZE = AARAKOCRA_RITUAL_SIZE;
const RITUAL_RANGE_FT = 30;
const RITUAL_TURNS = 3;

export interface AarakocraRitualResult {
  actionId: typeof RITUAL_ACTION_ID;
  participantId: string;
  progress: number;
  requiredProgress: number;
  ritualParticipantIds: string[];
  summoned: boolean;
  summonId?: string;
}

@Injectable()
export class AarakocraRitualService {
  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounters: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    private readonly concentration: ConcentrationService,
    private readonly summoning: SummoningService,
  ) {}

  async perform(
    encounterId: string,
    participantId: string,
  ): Promise<GameResult<AarakocraRitualResult>> {
    const encounter = await this.encounters.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return failure(
        "Encontro não está ativo.",
        GameErrorCode.ENCOUNTER_NOT_ACTIVE,
      );
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== participantId) {
      return failure(
        "Não é o turno deste participante.",
        GameErrorCode.NOT_YOUR_TURN,
      );
    }

    const actor = await this.participants.findOne({
      where: { id: participantId },
      relations: ["monster"],
    });
    if (
      !actor ||
      actor.encounterId !== encounterId ||
      actor.isDefeated ||
      actor.type !== "monster" ||
      !actor.monsterId ||
      !actor.monster?.slug.startsWith("aarakocra")
    ) {
      return failure(
        "Somente um Aarakocra vivo pode realizar este ritual.",
        GameErrorCode.FEATURE_NOT_AVAILABLE,
      );
    }
    if (actor.actionUsed) {
      return failure(
        "A ação já foi utilizada neste turno.",
        GameErrorCode.NO_ACTION_AVAILABLE,
      );
    }
    if (
      (actor.rechargeState ?? {})[AARAKOCRA_RITUAL_ACTION_ID] === "used"
    ) {
      return failure(
        "Este Aarakocra já participou desta invocação e permanece indisponível no estado atual.",
        GameErrorCode.NO_USES_REMAINING,
      );
    }

    const aarakocra = (
      await this.participants.find({
      where: {
        encounterId,
        monsterId: actor.monsterId,
        isDefeated: false,
      },
      relations: ["monster"],
      })
    ).filter(
      (participant) =>
        encounter.turnOrder.includes(participant.id) &&
        (participant.rechargeState ?? {})[AARAKOCRA_RITUAL_ACTION_ID] !==
          "used",
    );
    const group =
      this.findActiveGroup(aarakocra, actor.id) ??
      this.findValidGroup(aarakocra, actor.id);
    if (!group) {
      return failure(
        "O ritual exige cinco Aarakocra vivos a até 30 pés uns dos outros.",
        GameErrorCode.FEATURE_NOT_AVAILABLE,
      );
    }

    const groupIds = group.map((participant) => participant.id).sort();
    const groupId = groupIds.join(":");
    const previous = this.ritualEffect(actor, groupId);
    if (previous?.payload.ritualLastRound === encounter.currentRound) {
      return failure(
        "Este Aarakocra já dançou neste round.",
        GameErrorCode.ACTION_ALREADY_USED,
      );
    }
    const isConsecutive =
      previous?.payload.ritualLastRound === encounter.currentRound - 1;
    const progress = previous
      ? isConsecutive
        ? Math.min(
            RITUAL_TURNS,
            (previous.payload.ritualProgress ?? 0) + 1,
          )
        : 1
      : 1;

    const concentrationEvents: GameEventData[] = [];
    if (!previous) {
      const concentration = await this.concentration.startNew(
        actor,
        "Summon Air Elemental ritual",
        null,
        null,
      );
      concentrationEvents.push(...concentration.events);
    }
    const effect: EffectInstance = {
      id: previous?.id ?? randomUUID(),
      sourceFeatureSlug: RITUAL_ACTION_ID,
      sourceCasterParticipantId: actor.id,
      kind: RITUAL_EFFECT_KIND,
      payload: {
        ritualGroupId: groupId,
        ritualParticipantIds: groupIds,
        ritualProgress: progress,
        ritualLastRound: encounter.currentRound,
      },
      expiresAt: { kind: "end_of_encounter" },
      requiresConcentration: true,
      appliedAt: previous?.appliedAt ?? new Date().toISOString(),
    };
    actor.effectInstances = [
      ...(actor.effectInstances ?? []).filter(
        (candidate) =>
          !(
            candidate.kind === RITUAL_EFFECT_KIND &&
            candidate.sourceFeatureSlug === RITUAL_ACTION_ID
          ),
      ),
      effect,
    ];
    actor.actionUsed = true;
    actor.movementRemaining = 0;
    await this.participants.save(actor);

    const freshGroup = await this.participants.findByIds(groupIds);
    const allComplete = freshGroup.every(
      (participant) =>
        this.ritualEffect(participant, groupId)?.payload.ritualProgress ===
        RITUAL_TURNS,
    );
    let summonId: string | undefined;
    const events: GameEventData[] = [
      ...concentrationEvents,
      {
        event_type: "aarakocra_ritual_progress",
        actor_participant_id: actor.id,
        data: {
          actionId: RITUAL_ACTION_ID,
          progress,
          requiredProgress: RITUAL_TURNS,
          ritualParticipantIds: groupIds,
          movementConsumed: true,
          actionConsumed: true,
        },
      },
    ];

    if (allComplete) {
      const position = await this.findUnoccupiedPosition(encounterId, actor);
      const namesById = new Map(
        freshGroup.map((member) => [member.id, member.displayName]),
      );
      const ritualParticipantNames = groupIds.map(
        (id) => namesById.get(id) ?? id,
      );
      const summon = await this.summoning.spawnSummon(encounterId, {
        casterParticipantId: actor.id,
        monsterSlug: "air-elemental",
        displayName: "Air Elemental Invocado",
        position,
        faction: actor.faction,
        controlMode:
          actor.controlledBy === "ai" ? "ai-controlled" : "own-initiative",
        durationRoundsTotal: 600,
        concentrationLinked: false,
        source: AARAKOCRA_RITUAL_SUMMON_SOURCE,
        metadata: {
          ritualParticipantIds: groupIds,
          ritualParticipantNames,
        },
      });
      summonId = summon.id;
      for (const member of freshGroup) {
        member.effectInstances = (member.effectInstances ?? []).filter(
          (candidate) =>
            !(
              candidate.kind === RITUAL_EFFECT_KIND &&
              candidate.payload.ritualGroupId === groupId
            ),
        );
        if (member.concentratingOn === "Summon Air Elemental ritual") {
          member.isConcentrating = false;
          member.concentratingOn = null;
          member.concentrationRoundsRemaining = null;
          member.concentrationSaveDc = null;
        }
        member.rechargeState = {
          ...(member.rechargeState ?? {}),
          [AARAKOCRA_RITUAL_ACTION_ID]: "used",
        };
      }
      await this.participants.save(freshGroup);
      events.push({
        event_type: "summon_spawned",
        actor_participant_id: actor.id,
        target_participant_id: summon.id,
        data: {
          summonId: summon.id,
          summonMonsterSlug: "air-elemental",
          displayName: summon.displayName,
          source: RITUAL_ACTION_ID,
          durationRoundsTotal: 600,
          ritualParticipantIds: groupIds,
          ritualParticipantNames,
        },
      });
    }

    return success(
      {
        actionId: RITUAL_ACTION_ID,
        participantId: actor.id,
        progress,
        requiredProgress: RITUAL_TURNS,
        ritualParticipantIds: groupIds,
        summoned: allComplete,
        summonId,
      },
      events,
    );
  }

  private ritualEffect(
    participant: EncounterParticipantEntity,
    groupId?: string,
  ): EffectInstance | undefined {
    return (participant.effectInstances ?? []).find(
      (effect) =>
        effect.kind === RITUAL_EFFECT_KIND &&
        effect.sourceFeatureSlug === RITUAL_ACTION_ID &&
        (!groupId || effect.payload.ritualGroupId === groupId),
    );
  }

  private findActiveGroup(
    candidates: EncounterParticipantEntity[],
    actorId: string,
  ): EncounterParticipantEntity[] | null {
    for (const candidate of candidates) {
      const ids = this.ritualEffect(candidate)?.payload.ritualParticipantIds;
      if (!ids?.includes(actorId) || ids.length !== RITUAL_SIZE) continue;
      const group = ids
        .map((id) => candidates.find((participant) => participant.id === id))
        .filter(
          (participant): participant is EncounterParticipantEntity =>
            participant != null,
        );
      if (
        group.length === RITUAL_SIZE &&
        this.allWithinRange(group, RITUAL_RANGE_FT)
      ) {
        return group;
      }
    }
    return null;
  }

  private findValidGroup(
    candidates: EncounterParticipantEntity[],
    actorId: string,
  ): EncounterParticipantEntity[] | null {
    const actor = candidates.find((candidate) => candidate.id === actorId);
    if (!actor) return null;
    const others = candidates
      .filter((candidate) => candidate.id !== actorId)
      .sort((left, right) => left.id.localeCompare(right.id));
    const combinations = this.combinations(others, RITUAL_SIZE - 1);
    for (const combination of combinations) {
      const group = [actor, ...combination];
      if (this.allWithinRange(group, RITUAL_RANGE_FT)) return group;
    }
    return null;
  }

  private combinations<T>(items: T[], size: number): T[][] {
    if (size === 0) return [[]];
    if (items.length < size) return [];
    const result: T[][] = [];
    for (let index = 0; index <= items.length - size; index++) {
      for (const tail of this.combinations(items.slice(index + 1), size - 1)) {
        result.push([items[index], ...tail]);
      }
    }
    return result;
  }

  private allWithinRange(
    participants: EncounterParticipantEntity[],
    rangeFt: number,
  ): boolean {
    return participants.every((left, leftIndex) =>
      participants.slice(leftIndex + 1).every((right) => {
        if (
          left.positionX == null ||
          left.positionY == null ||
          right.positionX == null ||
          right.positionY == null
        ) {
          return false;
        }
        return (
          Math.max(
            Math.abs(left.positionX - right.positionX),
            Math.abs(left.positionY - right.positionY),
          ) *
            5 <=
          rangeFt
        );
      }),
    );
  }

  private async findUnoccupiedPosition(
    encounterId: string,
    actor: EncounterParticipantEntity,
  ): Promise<{ x: number; y: number }> {
    const participants = await this.participants.find({
      where: { encounterId, isDefeated: false },
    });
    const occupied = new Set(
      participants
        .filter(
          (participant) =>
            participant.positionX != null && participant.positionY != null,
        )
        .map(
          (participant) =>
            `${participant.positionX as number},${participant.positionY as number}`,
        ),
    );
    const originX = actor.positionX ?? 0;
    const originY = actor.positionY ?? 0;
    for (let radius = 1; radius <= 12; radius++) {
      for (let y = originY - radius; y <= originY + radius; y++) {
        for (let x = originX - radius; x <= originX + radius; x++) {
          if (x < 0 || y < 0) continue;
          if (Math.max(Math.abs(x - originX), Math.abs(y - originY)) !== radius)
            continue;
          if (!occupied.has(`${x},${y}`)) return { x, y };
        }
      }
    }
    return { x: originX, y: originY };
  }
}
