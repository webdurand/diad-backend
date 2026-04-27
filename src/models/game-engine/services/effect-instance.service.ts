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

export interface AddEffectInput {
  kind: EffectInstanceKind;
  sourceSpellSlug?: string;
  sourceFeatureSlug?: string;
  sourceCasterParticipantId: string;
  payload: EffectInstancePayload;
  expiresAt: { kind: EffectExpirationKind; value?: number };
  requiresConcentration: boolean;
}

/**
 * Spec 004 — Effect Resolution Engine.
 *
 * Helpers para CRUD de EffectInstance em encounter_participant.effectInstances.
 * Mantem o invariante de concentracao: quando requiresConcentration=true, o
 * caster ganha um AppliedEffect { kind: 'effect-instance', refId } para que
 * ConcentrationService.break() cascade-remove em ambos os lados.
 *
 * Note: este service eh a porta de entrada p/ TODOS os callers que aplicam
 * effect mecanico. Callers diretos ao `target.effectInstances.push(...)` sao
 * proibidos (quebram a invariante de concentracao).
 */
@Injectable()
export class EffectInstanceService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
  ) {}

  /**
   * Aplica um EffectInstance em `target`. Se requiresConcentration=true,
   * tambem grava tracker em caster.appliedEffects para cascade de quebra.
   */
  async addEffect(
    target: EncounterParticipantEntity,
    input: AddEffectInput,
  ): Promise<{ effect: EffectInstance; events: GameEventData[] }> {
    const effect: EffectInstance = {
      id: randomUUID(),
      sourceSpellSlug: input.sourceSpellSlug,
      sourceFeatureSlug: input.sourceFeatureSlug,
      sourceCasterParticipantId: input.sourceCasterParticipantId,
      kind: input.kind,
      payload: input.payload,
      expiresAt: input.expiresAt,
      requiresConcentration: input.requiresConcentration,
      appliedAt: new Date().toISOString(),
    };

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

    // Cascade tracker no caster: quando ele quebra concentracao, effect some.
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

    return { effect, events };
  }

  /** Remove effect por id; retorna events pra stream downstream. */
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
    await this.participants.save(target);

    // Remover tracker no caster (se existia)
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
      events: [
        {
          event_type: "effect_expired",
          target_participant_id: target.id,
          data: { effectId, reason, kind: removed.kind },
        },
      ],
    };
  }

  /**
   * Remove em cascata todos os effects (em qualquer participant) cujo
   * sourceCasterParticipantId === casterId E requiresConcentration === true.
   * Chamado pelo ConcentrationService.break().
   */
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

  /**
   * Tick de durações no end-turn do participant.
   * Decrementa `expiresAt.value` de effects com kind='rounds'|'turns'|'until_caster_turn';
   * remove quando chega a 0.
   */
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
          e.expiresAt.kind === "turns" ||
          e.expiresAt.kind === "until_caster_turn") &&
        typeof e.expiresAt.value === "number"
      ) {
        const newValue = e.expiresAt.value - 1;
        if (newValue <= 0) {
          expired.push(e.id);
          events.push({
            event_type: "effect_expired",
            target_participant_id: participant.id,
            data: { effectId: e.id, reason: "duration", kind: e.kind },
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
}
