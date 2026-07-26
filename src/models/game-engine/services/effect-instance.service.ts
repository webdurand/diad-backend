import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type {
  AppliedEffect,
  EffectInstance,
  EffectInstanceKind,
  EffectInstancePayload,
  EffectExpirationKind,
} from "../interfaces/combat.interfaces";
import type { GameEventData } from "../interfaces/result.type";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import {
  hasFreedomOfMovement,
  isMagicalSpeedReduction,
} from "./freedom-of-movement";

export interface AddEffectInput {
  kind: EffectInstanceKind;
  sourceSpellSlug?: string;
  sourceFeatureSlug?: string;
  sourceCasterParticipantId: string;
  payload: EffectInstancePayload;
  expiresAt: { kind: EffectExpirationKind; value?: number };
  requiresConcentration: boolean;
}


@Injectable()
export class EffectInstanceService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    private readonly characterState: CharacterStateService,
  ) {}

  private async applyHitPointMaximumDelta(
    target: EncounterParticipantEntity,
    delta: number,
  ): Promise<{
    hpBefore: number;
    hpAfter: number;
    maxHpBefore: number;
    maxHpAfter: number;
  }> {
    if (target.type === "pc" && target.characterId) {
      const result =
        await this.characterState.adjustTemporaryHitPointMaximum(
          target.characterId,
          delta,
        );
      target.currentHp = result.currentHpAfter;
      target.maxHp = result.maxHpAfter;
      return {
        hpBefore: result.currentHpBefore,
        hpAfter: result.currentHpAfter,
        maxHpBefore: result.maxHpBefore,
        maxHpAfter: result.maxHpAfter,
      };
    }

    const maxHpBefore = Math.max(
      1,
      target.maxHp ?? target.currentHp ?? 1,
    );
    const hpBefore = Math.max(0, target.currentHp ?? maxHpBefore);
    const maxHpAfter = Math.max(1, maxHpBefore + delta);
    const hpAfter = Math.max(0, Math.min(maxHpAfter, hpBefore + delta));
    target.maxHp = maxHpAfter;
    target.currentHp = hpAfter;
    return { hpBefore, hpAfter, maxHpBefore, maxHpAfter };
  }

  async addEffect(
    target: EncounterParticipantEntity,
    input: AddEffectInput,
  ): Promise<{
    effect: EffectInstance;
    events: GameEventData[];
    applied: boolean;
  }> {
    const payload = { ...input.payload };
    if (
      input.kind === "hit_point_maximum_bonus" &&
      typeof payload.amount === "number" &&
      payload.amount !== 0
    ) {
      Object.assign(
        payload,
        await this.applyHitPointMaximumDelta(target, payload.amount),
      );
    }
    const effect: EffectInstance = {
      id: randomUUID(),
      sourceSpellSlug: input.sourceSpellSlug,
      sourceFeatureSlug: input.sourceFeatureSlug,
      sourceCasterParticipantId: input.sourceCasterParticipantId,
      kind: input.kind,
      payload,
      expiresAt: input.expiresAt,
      requiresConcentration: input.requiresConcentration,
      appliedAt: new Date().toISOString(),
    };
    if (
      hasFreedomOfMovement(target) &&
      isMagicalSpeedReduction(effect)
    ) {
      return {
        effect,
        applied: false,
        events: [
          {
            event_type: "effect_blocked_by_freedom_of_movement",
            actor_participant_id: input.sourceCasterParticipantId,
            target_participant_id: target.id,
            data: {
              kind: input.kind,
              sourceSpellSlug: input.sourceSpellSlug,
              sourceFeatureSlug: input.sourceFeatureSlug,
              freedomSourceSpellSlug: "freedom-of-movement",
            },
          },
        ],
      };
    }

    target.effectInstances = [...(target.effectInstances ?? []), effect];
    await this.participants.save(target);

    const events: GameEventData[] = [
      {
        event_type: "effect_applied",
        target_participant_id: target.id,
        actor_participant_id: input.sourceCasterParticipantId,
        data: {
          effectId: effect.id,
          kind: effect.kind,
          sourceSpellSlug: effect.sourceSpellSlug,
          sourceFeatureSlug: effect.sourceFeatureSlug,
          payload: effect.payload,
          expiresAt: effect.expiresAt,
          requiresConcentration: effect.requiresConcentration,
        },
      },
    ];


    if (input.requiresConcentration) {
      const caster = await this.participants.findOne({
        where: { id: input.sourceCasterParticipantId },
      });
      if (caster) {
        const tracker: AppliedEffect = {
          kind: "effect-instance",
          refId: effect.id,
          targetParticipantId: target.id,
          description: `${input.sourceSpellSlug ?? input.sourceFeatureSlug ?? "effect"} → ${effect.kind}`,
        };
        caster.appliedEffects = [...(caster.appliedEffects ?? []), tracker];
        await this.participants.save(caster);
      }
    }

    return { effect, events, applied: true };
  }


  async removeEffect(
    target: EncounterParticipantEntity,
    effectId: string,
    reason:
      | "duration"
      | "save_succeeded"
      | "consumed"
      | "concentration_broken"
      | "manual",
  ): Promise<{ removed: boolean; events: GameEventData[] }> {
    const before = target.effectInstances ?? [];
    const removed = before.find((e) => e.id === effectId);
    if (!removed) return { removed: false, events: [] };
    target.effectInstances = before.filter((e) => e.id !== effectId);
    let hitPointChange:
      | {
          hpBefore: number;
          hpAfter: number;
          maxHpBefore: number;
          maxHpAfter: number;
        }
      | undefined;
    if (
      removed.kind === "hit_point_maximum_bonus" &&
      typeof removed.payload?.amount === "number" &&
      removed.payload.amount !== 0
    ) {
      hitPointChange = await this.applyHitPointMaximumDelta(
        target,
        -removed.payload.amount,
      );
    }
    await this.participants.save(target);


    if (removed.requiresConcentration) {
      const caster = await this.participants.findOne({
        where: { id: removed.sourceCasterParticipantId },
      });
      if (caster) {
        caster.appliedEffects = (caster.appliedEffects ?? []).filter(
          (a) => !(a.kind === "effect-instance" && a.refId === effectId),
        );
        await this.participants.save(caster);
      }
    }

    return {
      removed: true,
      events:
        removed.kind === "tile_effect_entry_marker" ||
        removed.kind === "tile_effect_turn_trigger_marker"
          ? []
          : [
              {
                event_type: "effect_expired",
                target_participant_id: target.id,
                data: {
                  effectId,
                  reason,
                  kind: removed.kind,
                  sourceSpellSlug: removed.sourceSpellSlug,
                  sourceFeatureSlug: removed.sourceFeatureSlug,
                  payload: removed.payload,
                  ...hitPointChange,
                },
              },
            ],
    };
  }


  async removeAllByConcentrationBreak(
    encounterId: string,
    casterId: string,
  ): Promise<{ events: GameEventData[] }> {
    const participants = await this.participants.find({
      where: { encounterId },
    });
    const events: GameEventData[] = [];
    for (const p of participants) {
      const keep: EffectInstance[] = [];
      let changed = false;
      for (const e of p.effectInstances ?? []) {
        if (
          e.requiresConcentration &&
          e.sourceCasterParticipantId === casterId
        ) {
          events.push({
            event_type: "effect_expired",
            target_participant_id: p.id,
            data: {
              effectId: e.id,
              reason: "concentration_broken",
              kind: e.kind,
            },
          });
          changed = true;
          continue;
        }
        keep.push(e);
      }
      if (changed) {
        p.effectInstances = keep;
        await this.participants.save(p);
      }
    }
    return { events };
  }


  async tickAtEndOfTurn(participant: EncounterParticipantEntity): Promise<{
    events: GameEventData[];
    ticked: Array<{ effectId: string; newValue: number }>;
    expired: string[];
  }> {
    const ticked: Array<{ effectId: string; newValue: number }> = [];
    const expired: string[] = [];
    const events: GameEventData[] = [];
    const keep: EffectInstance[] = [];
    let changed = false;

    for (const e of participant.effectInstances ?? []) {
      if (
        (e.expiresAt.kind === "rounds" ||
          e.expiresAt.kind === "turns") &&
        typeof e.expiresAt.value === "number"
      ) {
        const newValue = e.expiresAt.value - 1;
        if (newValue <= 0) {
          let hitPointChange:
            | {
                hpBefore: number;
                hpAfter: number;
                maxHpBefore: number;
                maxHpAfter: number;
              }
            | undefined;
          if (
            e.kind === "hit_point_maximum_bonus" &&
            typeof e.payload?.amount === "number" &&
            e.payload.amount !== 0
          ) {
            hitPointChange = await this.applyHitPointMaximumDelta(
              participant,
              -e.payload.amount,
            );
          }
          expired.push(e.id);
          events.push({
            event_type: "effect_expired",
            target_participant_id: participant.id,
            data: {
              effectId: e.id,
              reason: "duration",
              kind: e.kind,
              sourceSpellSlug: e.sourceSpellSlug,
              sourceFeatureSlug: e.sourceFeatureSlug,
              payload: e.payload,
              ...hitPointChange,
            },
          });
          changed = true;
          continue;
        }
        ticked.push({ effectId: e.id, newValue });
        keep.push({ ...e, expiresAt: { ...e.expiresAt, value: newValue } });
        changed = true;
      } else {
        keep.push(e);
      }
    }

    if (changed) {
      participant.effectInstances = keep;
      await this.participants.save(participant);
    }

    return { events, ticked, expired };
  }

  async expireAtStartOfTurn(
    encounterId: string,
    participantId: string,
  ): Promise<{ events: GameEventData[]; expired: string[] }> {
    const participants = await this.participants.find({
      where: { encounterId },
    });
    const events: GameEventData[] = [];
    const expired: string[] = [];
    for (const participant of participants) {
      const matching = (participant.effectInstances ?? []).filter(
        (effect) =>
          (effect.expiresAt.kind === "until_caster_turn" &&
            effect.sourceCasterParticipantId === participantId) ||
          (effect.expiresAt.kind === "until_target_turn" &&
            participant.id === participantId),
      );
      for (const effect of matching) {
        const result = await this.removeEffect(
          participant,
          effect.id,
          "duration",
        );
        if (result.removed) {
          expired.push(effect.id);
          events.push(...result.events);
        }
      }
    }
    return { events, expired };
  }

  async tickAtEndOfCasterTurn(
    encounterId: string,
    casterParticipantId: string,
  ): Promise<{ events: GameEventData[]; expired: string[] }> {
    const participants = await this.participants.find({
      where: { encounterId },
    });
    const events: GameEventData[] = [];
    const expired: string[] = [];

    for (const participant of participants) {
      const matching = (participant.effectInstances ?? []).filter(
        (effect) =>
          effect.expiresAt.kind === "caster_turn_ends" &&
          effect.sourceCasterParticipantId === casterParticipantId,
      );
      for (const effect of matching) {
        const remaining = (effect.expiresAt.value ?? 1) - 1;
        if (remaining <= 0) {
          const result = await this.removeEffect(
            participant,
            effect.id,
            "duration",
          );
          if (result.removed) {
            expired.push(effect.id);
            events.push(...result.events);
          }
          continue;
        }
        participant.effectInstances = (participant.effectInstances ?? []).map(
          (current) =>
            current.id === effect.id
              ? {
                  ...current,
                  expiresAt: {
                    ...current.expiresAt,
                    value: remaining,
                  },
                }
              : current,
        );
        await this.participants.save(participant);
      }
    }

    return { events, expired };
  }
}
