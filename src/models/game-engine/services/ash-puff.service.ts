import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type {
  EffectInstance,
  SavingThrowResult,
} from "../interfaces/combat.interfaces";
import type { GameEventData } from "../interfaces/result.type";
import { chebyshevDistanceFt } from "./combat-range";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { participantCreatureType } from "./protection-from-evil-good";

const ASH_PUFF_RADIUS_FT = 5;
const ASH_PUFF_SAVE_DC = 10;
const ASH_PUFF_DURATION_ROUNDS = 10;

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function hasAshPuff(specialAbilities: unknown): boolean {
  const abilities = Array.isArray(specialAbilities)
    ? specialAbilities
    : specialAbilities && typeof specialAbilities === "object"
      ? Object.values(specialAbilities as Record<string, unknown>)
      : [];

  return abilities.some((ability) => {
    if (typeof ability === "string") {
      return normalize(ability).includes("ash puff");
    }
    if (!ability || typeof ability !== "object") return false;
    const record = ability as Record<string, unknown>;
    return (
      normalize(record.name).includes("ash puff") ||
      normalize(record.desc ?? record.description).includes("ash puff")
    );
  });
}

export function hasTriggeredAshPuff(
  participant: Pick<EncounterParticipantEntity, "effectInstances">,
): boolean {
  return (participant.effectInstances ?? []).some(
    (effect) => effect.kind === "ash_puff_triggered",
  );
}

export function isLivingAshPuffTarget(
  source: EncounterParticipantEntity,
  candidate: EncounterParticipantEntity,
): boolean {
  if (candidate.id === source.id) return false;
  if (
    source.positionX == null ||
    source.positionY == null ||
    candidate.positionX == null ||
    candidate.positionY == null
  ) {
    return false;
  }
  if (
    chebyshevDistanceFt(
      { x: source.positionX, y: source.positionY },
      { x: candidate.positionX, y: candidate.positionY },
    ) > ASH_PUFF_RADIUS_FT
  ) {
    return false;
  }

  const creatureType = participantCreatureType(candidate);
  if (creatureType.includes("undead") || creatureType.includes("construct")) {
    return false;
  }
  if (candidate.dyingState === "dead") return false;
  if (
    candidate.type !== "pc" &&
    (candidate.isDefeated || (candidate.currentHp ?? 0) <= 0)
  ) {
    return false;
  }
  return true;
}

export interface AshPuffTriggerInput {
  source: EncounterParticipantEntity;
  damageApplied: number;
  knownParticipants?: EncounterParticipantEntity[];
  rollSavingThrow: (
    target: EncounterParticipantEntity,
  ) => Promise<SavingThrowResult>;
}

export interface AshPuffTriggerResult {
  triggered: boolean;
  affectedParticipantIds: string[];
  events: GameEventData[];
}

@Injectable()
export class AshPuffService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    private readonly conditions: ConditionLifecycleService,
  ) {}

  async triggerAfterMonsterDamage(
    input: AshPuffTriggerInput,
  ): Promise<AshPuffTriggerResult> {
    const { source } = input;
    if (
      input.damageApplied <= 0 ||
      !source.monster ||
      !hasAshPuff(source.monster.special_abilities) ||
      hasTriggeredAshPuff(source)
    ) {
      return { triggered: false, affectedParticipantIds: [], events: [] };
    }

    const marker: EffectInstance = {
      id: randomUUID(),
      sourceFeatureSlug: "ash-puff",
      sourceCasterParticipantId: source.id,
      kind: "ash_puff_triggered",
      payload: {
        radiusFeet: ASH_PUFF_RADIUS_FT,
        saveDc: ASH_PUFF_SAVE_DC,
      },
      expiresAt: { kind: "end_of_encounter" },
      requiresConcentration: false,
      appliedAt: new Date().toISOString(),
    };
    source.effectInstances = [...(source.effectInstances ?? []), marker];
    await this.participants.save(source);

    const encounterParticipants = await this.participants.find({
      where: { encounterId: source.encounterId },
      relations: ["monster"],
    });
    const knownParticipants = new Map(
      (input.knownParticipants ?? []).map((participant) => [
        participant.id,
        participant,
      ]),
    );
    const targets = encounterParticipants
      .map((candidate) => knownParticipants.get(candidate.id) ?? candidate)
      .filter((candidate) =>
        isLivingAshPuffTarget(source, candidate),
      );
    const affectedParticipantIds = targets.map((target) => target.id);
    const events: GameEventData[] = [
      {
        event_type: "ash_puff_triggered",
        actor_participant_id: source.id,
        data: {
          sourceName: source.displayName,
          radiusFeet: ASH_PUFF_RADIUS_FT,
          saveAbility: "con",
          saveDc: ASH_PUFF_SAVE_DC,
          durationRounds: ASH_PUFF_DURATION_ROUNDS,
          affectedParticipantIds,
          markerEffectId: marker.id,
        },
      },
    ];

    for (const target of targets) {
      const save = await input.rollSavingThrow(target);
      events.push({
        event_type: "save_rolled",
        actor_participant_id: source.id,
        target_participant_id: target.id,
        data: {
          sourceAction: "Ash Puff",
          ability: save.ability,
          dc: save.dc,
          roll: save.roll,
          modifier: save.modifier,
          total: save.total,
          success: save.success,
          advantage: save.advantage,
        },
      });
      if (save.success) continue;

      const applied = await this.conditions.applyCondition(target, {
        slug: "ash_puff",
        appliedBy: source.id,
        source: "ability:ash-puff",
        saveAbility: "con",
        saveDc: ASH_PUFF_SAVE_DC,
        repeatSaveTiming: "end_of_turn",
        durationRoundsRemaining: ASH_PUFF_DURATION_ROUNDS,
      });
      events.push(...applied.events);
    }

    return { triggered: true, affectedParticipantIds, events };
  }
}
