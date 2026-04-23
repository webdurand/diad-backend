import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { PersistentAreaEffectEntity } from 'src/entities/persistent-area-effect.entity';
import type {
  AppliedEffect,
  ConditionInstance,
  ConditionSlug,
} from '../interfaces/combat.interfaces';
import type { GameEventData } from '../interfaces/result.type';

export type ConcentrationBreakReason =
  | 'damage'
  | 'incapacitated'
  | 'replaced'
  | 'expired'
  | 'death'
  | 'manual';

const INCAPACITATING: ConditionSlug[] = [
  'incapacitated',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
];

/**
 * Spec 004 — Rastreio e quebra automática de concentração.
 *
 * Cobre 5 gatilhos (PHB cap. 10 + research D4):
 *  - dano (CON save delegado a combat.service)
 *  - incapacitated/sub
 *  - nova spell de concentração (replace)
 *  - duração expirada
 *  - morte
 *
 * Quebra é atómica: itera `appliedEffects` e remove cada
 * ConditionInstance/PersistentAreaEffect que esta concentração mantinha.
 */
@Injectable()
export class ConcentrationService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    @InjectRepository(PersistentAreaEffectEntity)
    private readonly areas: Repository<PersistentAreaEffectEntity>,
  ) {}

  /**
   * Inicia uma nova concentração. Se o caster já estava concentrando, quebra a
   * anterior atomicamente antes (evento `concentration_replaced`).
   */
  async startNew(
    caster: EncounterParticipantEntity,
    spellName: string,
    durationRounds: number | null,
    saveDc: number | null,
  ): Promise<{ events: GameEventData[]; broken: boolean }> {
    const events: GameEventData[] = [];
    let broken = false;
    if (caster.isConcentrating) {
      const r = await this.break(caster, 'replaced');
      events.push(...r.events);
      broken = true;
    }
    caster.isConcentrating = true;
    caster.concentratingOn = spellName;
    caster.concentrationRoundsRemaining = durationRounds;
    caster.concentrationSaveDc = saveDc;
    caster.appliedEffects = caster.appliedEffects ?? [];
    await this.participants.save(caster);
    events.push({
      event_type: 'concentration_started',
      actor_participant_id: caster.id,
      data: { spellName, durationRounds, saveDc },
    });
    return { events, broken };
  }

  /**
   * Adiciona um efeito aplicado pela concentração ativa (ex: condition em
   * alvo, ou criação de PersistentAreaEffect).
   */
  async trackAppliedEffect(
    caster: EncounterParticipantEntity,
    effect: AppliedEffect,
  ): Promise<void> {
    caster.appliedEffects = [...(caster.appliedEffects ?? []), effect];
    await this.participants.save(caster);
  }

  /**
   * Quebra concentração e remove **atomicamente** todos os appliedEffects.
   */
  async break(
    caster: EncounterParticipantEntity,
    reason: ConcentrationBreakReason,
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    if (!caster.isConcentrating) {
      return { events };
    }
    const prev = caster.concentratingOn;
    const effects = caster.appliedEffects ?? [];

    // Buscar todos os participantes alvo de uma vez
    const targetIds = effects
      .filter((e) => e.kind === 'condition' && e.targetParticipantId)
      .map((e) => e.targetParticipantId as string);
    const uniqueIds = Array.from(new Set(targetIds));
    const targets = uniqueIds.length
      ? await this.participants.findByIds(uniqueIds)
      : [];

    for (const eff of effects) {
      if (eff.kind === 'condition' && eff.targetParticipantId) {
        const tgt = targets.find((t) => t.id === eff.targetParticipantId);
        if (!tgt) continue;
        const before = (tgt.conditionInstances ?? []).length;
        tgt.conditionInstances = (tgt.conditionInstances ?? []).filter(
          (ci) => ci.id !== eff.refId,
        );
        if (tgt.conditionInstances.length !== before) {
          // Sincroniza legacy `conditions: string[]`
          tgt.conditions = this.deriveSlugs(tgt.conditionInstances);
          events.push({
            event_type: 'condition_removed',
            target_participant_id: tgt.id,
            data: { instanceId: eff.refId, reason: 'concentration_broken' },
          });
        }
      } else if (eff.kind === 'persistent-area') {
        await this.areas.delete({ id: eff.refId });
        events.push({
          event_type: 'persistent_area_removed',
          data: { areaId: eff.refId, reason: 'concentration_broken' },
        });
      }
    }
    if (targets.length) await this.participants.save(targets);

    // Spec 004 — cascade-remove EffectInstances onde o caster perdeu concentracao.
    // NB: iteramos re-fetched participants, mas o proprio `caster` pode estar no
    // loop como uma NOVA instancia. Se for, precisamos sincronizar de volta
    // antes do save final, senao o save do caster overwrite as mudancas.
    const encounterParticipants = await this.participants.find({
      where: { encounterId: caster.encounterId },
    });
    for (const p of encounterParticipants) {
      const before = p.effectInstances ?? [];
      const kept = before.filter(
        (e) =>
          !(
            e.requiresConcentration &&
            e.sourceCasterParticipantId === caster.id
          ),
      );
      if (kept.length !== before.length) {
        for (const e of before) {
          if (
            e.requiresConcentration &&
            e.sourceCasterParticipantId === caster.id
          ) {
            events.push({
              event_type: 'effect_expired',
              target_participant_id: p.id,
              data: {
                effectId: e.id,
                reason: 'concentration_broken',
                kind: e.kind,
              },
            });
          }
        }
        p.effectInstances = kept;
        if (p.id === caster.id) {
          // Sincroniza pro save final do caster nao reverter.
          caster.effectInstances = kept;
        } else {
          await this.participants.save(p);
        }
      }

      // Spec 012 Lote B — revert transformations mantidas pela concentração.
      // Polymorph e similares registram sourceCasterParticipantId + revertTriggers.concentrationBroken.
      const tState = p.transformationState;
      if (
        tState &&
        tState.sourceCasterParticipantId === caster.id &&
        tState.revertTriggers?.concentrationBroken
      ) {
        const formName = tState.form.formName;
        const originalDisplay = tState.original.displayName;
        p.displayName = originalDisplay;
        p.transformationState = null;
        await this.participants.save(p);
        events.push({
          event_type: 'transformation_reverted',
          target_participant_id: p.id,
          actor_participant_id: caster.id,
          data: {
            reason: 'concentration_broken',
            formName,
            source: tState.source,
          },
        });
      }
    }

    caster.isConcentrating = false;
    caster.concentratingOn = undefined as unknown as string;
    caster.concentrationRoundsRemaining = null;
    caster.concentrationSaveDc = null;
    caster.appliedEffects = [];
    await this.participants.save(caster);

    events.push({
      event_type: 'concentration_lost',
      actor_participant_id: caster.id,
      data: { reason, spellName: prev },
    });
    return { events };
  }

  async breakDueToDeath(
    caster: EncounterParticipantEntity,
  ): Promise<{ events: GameEventData[] }> {
    return this.break(caster, 'death');
  }

  /**
   * Verifica se uma condição recém-aplicada quebra a concentração do alvo.
   * Chamado por `condition-lifecycle.service.applyCondition`.
   */
  async checkBreakOnCondition(
    target: EncounterParticipantEntity,
    addedSlug: ConditionSlug,
  ): Promise<{ events: GameEventData[]; broken: boolean }> {
    if (!target.isConcentrating) return { events: [], broken: false };
    if (!INCAPACITATING.includes(addedSlug)) {
      return { events: [], broken: false };
    }
    const r = await this.break(target, 'incapacitated');
    return { events: r.events, broken: true };
  }

  /**
   * Decrementa a duração da concentração ativa do participante. Ao chegar a 0,
   * concentração expira (evento + cascata).
   */
  async decrementDurationFor(
    caster: EncounterParticipantEntity,
  ): Promise<{ events: GameEventData[] }> {
    if (!caster.isConcentrating) return { events: [] };
    if (caster.concentrationRoundsRemaining == null) return { events: [] };
    caster.concentrationRoundsRemaining -= 1;
    if (caster.concentrationRoundsRemaining <= 0) {
      return this.break(caster, 'expired');
    }
    await this.participants.save(caster);
    return { events: [] };
  }

  private deriveSlugs(instances: ConditionInstance[]): string[] {
    return Array.from(new Set(instances.map((i) => i.slug)));
  }
}
