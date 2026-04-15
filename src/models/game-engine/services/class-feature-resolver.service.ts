import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { ConditionLifecycleService } from './condition-lifecycle.service';
import { EffectInstanceService } from './effect-instance.service';
import { DiceService } from './dice.service';
import type { GameEventData } from '../interfaces/result.type';

/**
 * Shape do payload do evento `class_feature_invoked` (Spec 003 contract).
 */
export interface ClassFeatureInvokedPayload {
  featureSlug: string;
  actionCost?: string;
  targets?: string[];
  options?: Record<string, unknown>;
  saveDc?: number;
  saveAbility?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  caster?: {
    abilityMods?: Record<string, number>;
    profBonus?: number;
    classSlug?: string;
    classLevel?: number;
  };
  triggerEventId?: string;
  status?: string;
}

/**
 * Spec 004 — Consumer dos eventos `class_feature_invoked` emitidos pela
 * Spec 3 com `status: 'emitted_pending_resolution'`. Dispatch por featureSlug:
 *
 *  - turn-undead → save WIS vs saveDc; fail = ConditionInstance 'turned' 10 rounds
 *  - rage        → 3 EffectInstance no source (damage_resistance, self_advantage, damage_bonus)
 *  - grapple     → target save STR vs saveDc; fail = ConditionInstance 'grappled' + vinculo
 *  - shove       → target save STR; fail = 'prone' OR push event
 *
 * Retorna { resolved, resolutionPayload, events[] }. Callers (class-feature-
 * executor, combat.service para unarmed-strike) invocam apos emitir o evento
 * pendente. Se featureSlug nao tem handler, retorna resolved=false e o evento
 * fica pendente (compat com Spec 9 futura).
 */
@Injectable()
export class ClassFeatureResolverService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    private readonly conditionLifecycle: ConditionLifecycleService,
    private readonly effectInstances: EffectInstanceService,
    private readonly dice: DiceService,
  ) {}

  async resolveInvocation(
    sourceParticipantId: string,
    payload: ClassFeatureInvokedPayload,
  ): Promise<{
    resolved: boolean;
    events: GameEventData[];
    resolutionPayload?: Record<string, unknown>;
  }> {
    const events: GameEventData[] = [];
    const slug = payload.featureSlug;

    switch (slug) {
      case 'turn-undead':
        return this.handleTurnUndead(sourceParticipantId, payload, events);
      case 'rage':
        return this.handleRage(sourceParticipantId, payload, events);
      case 'grapple':
        return this.handleGrapple(sourceParticipantId, payload, events);
      case 'shove':
        return this.handleShove(sourceParticipantId, payload, events);
      default:
        return { resolved: false, events };
    }
  }

  // ---- Handlers ----

  private async handleTurnUndead(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const saveDc = payload.saveDc ?? 10;
    const targets = payload.targets ?? [];
    const results: Array<{ targetId: string; rolled: number; saved: boolean }> = [];

    for (const tid of targets) {
      const target = await this.participants.findOne({ where: { id: tid } });
      if (!target) continue;
      // WIS save: d20 + WIS mod (crude; sem proficiencia aqui)
      const wisMod = this.getAbilityMod(target, 'wis');
      const rolled = this.dice.roll(20);
      const total = rolled + wisMod;
      const saved = total >= saveDc;
      results.push({ targetId: tid, rolled, saved });
      events.push({
        event_type: 'save_rolled',
        target_participant_id: tid,
        data: { ability: 'wis', dc: saveDc, rolled, modifier: wisMod, total, success: saved, source: 'turn-undead' },
      });
      if (!saved) {
        const r = await this.conditionLifecycle.applyCondition(target, {
          slug: 'frightened', // XPHB 2024: Turn Undead impoe 'frightened' (legacy usa 'turned' nao padrao)
          appliedBy: sourceId,
          sourceSpell: 'turn-undead',
          sourceConcentration: false,
          saveAbility: 'wis',
          saveDc,
          repeatSaveTiming: 'end_of_turn',
          durationRoundsRemaining: 10,
        });
        events.push(...r.events);
      }
    }

    return {
      resolved: true,
      events,
      resolutionPayload: { saves: results },
    };
  }

  private async handleRage(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };

    const classLevel = payload.caster?.classLevel ?? 1;
    const rageDamage = this.getRageDamageByLevel(classLevel);

    // Effect 1: damage_resistance B/P/S
    const r1 = await this.effectInstances.addEffect(source, {
      kind: 'damage_resistance',
      sourceFeatureSlug: 'rage',
      sourceCasterParticipantId: sourceId,
      payload: { damageTypes: ['bludgeoning', 'piercing', 'slashing'] },
      expiresAt: { kind: 'rounds', value: 10 },
      requiresConcentration: false,
    });
    events.push(...r1.events);

    // Effect 2: self_advantage em STR checks/saves
    const r2 = await this.effectInstances.addEffect(source, {
      kind: 'self_advantage',
      sourceFeatureSlug: 'rage',
      sourceCasterParticipantId: sourceId,
      payload: { scope: 'str-check' },
      expiresAt: { kind: 'rounds', value: 10 },
      requiresConcentration: false,
    });
    events.push(...r2.events);

    // Effect 3: damage_bonus em melee STR
    const r3 = await this.effectInstances.addEffect(source, {
      kind: 'damage_bonus',
      sourceFeatureSlug: 'rage',
      sourceCasterParticipantId: sourceId,
      payload: { amount: rageDamage, scope: 'melee' },
      expiresAt: { kind: 'rounds', value: 10 },
      requiresConcentration: false,
    });
    events.push(...r3.events);

    return {
      resolved: true,
      events,
      resolutionPayload: { effectIds: [r1.effect.id, r2.effect.id, r3.effect.id], rageDamage },
    };
  }

  private async handleGrapple(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const targetId = payload.targets?.[0];
    if (!targetId) return { resolved: false, events };
    const target = await this.participants.findOne({ where: { id: targetId } });
    if (!target) return { resolved: false, events };

    const saveDc = payload.saveDc ?? 10;
    const strMod = this.getAbilityMod(target, 'str');
    const rolled = this.dice.roll(20);
    const total = rolled + strMod;
    const saved = total >= saveDc;
    events.push({
      event_type: 'save_rolled',
      target_participant_id: targetId,
      data: { ability: 'str', dc: saveDc, rolled, modifier: strMod, total, success: saved, source: 'grapple' },
    });

    if (!saved) {
      const r = await this.conditionLifecycle.applyCondition(target, {
        slug: 'grappled',
        appliedBy: sourceId,
        sourceSpell: null,
        sourceConcentration: false,
      });
      events.push(...r.events);
      return {
        resolved: true,
        events,
        resolutionPayload: { saved: false, conditionInstanceId: r.instance.id },
      };
    }
    return { resolved: true, events, resolutionPayload: { saved: true } };
  }

  private async handleShove(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const targetId = payload.targets?.[0];
    if (!targetId) return { resolved: false, events };
    const target = await this.participants.findOne({ where: { id: targetId } });
    if (!target) return { resolved: false, events };

    const saveDc = payload.saveDc ?? 10;
    const strMod = this.getAbilityMod(target, 'str');
    const rolled = this.dice.roll(20);
    const total = rolled + strMod;
    const saved = total >= saveDc;
    events.push({
      event_type: 'save_rolled',
      target_participant_id: targetId,
      data: { ability: 'str', dc: saveDc, rolled, modifier: strMod, total, success: saved, source: 'shove' },
    });

    if (!saved) {
      const outcome =
        (payload.options?.outcome as string | undefined) ?? 'prone';
      if (outcome === 'prone' || outcome === 'pending') {
        const r = await this.conditionLifecycle.applyCondition(target, {
          slug: 'prone',
          appliedBy: sourceId,
          sourceSpell: null,
          sourceConcentration: false,
        });
        events.push(...r.events);
        return {
          resolved: true,
          events,
          resolutionPayload: { saved: false, outcome: 'prone', conditionInstanceId: r.instance.id },
        };
      }
      // push-5ft: movement event (fora do escopo AC — emitir ONLY)
      events.push({
        event_type: 'movement_forced',
        target_participant_id: targetId,
        data: { source: 'shove', distanceFt: 5, by: sourceId },
      });
      return {
        resolved: true,
        events,
        resolutionPayload: { saved: false, outcome: 'push-5ft' },
      };
    }
    return { resolved: true, events, resolutionPayload: { saved: true } };
  }

  // ---- helpers ----

  private getAbilityMod(p: EncounterParticipantEntity, ability: string): number {
    if (p.type === 'monster' && p.monster) {
      const score = (p.monster as any)?.stats?.[ability] ?? 10;
      return Math.floor((score - 10) / 2);
    }
    // PC: assume 0 por padrao aqui; o caller ideal computaria via sheet, mas
    // handleRage/grapple nao tem userId. Para alvos monstros funciona bem;
    // para alvos PC (Turn Undead contra cleric??) refinar em spec futura.
    return 0;
  }

  private getRageDamageByLevel(level: number): number {
    // XPHB 2024 Barbarian Rage Damage: L1-8=+2, L9-15=+3, L16+=+4
    if (level >= 16) return 4;
    if (level >= 9) return 3;
    return 2;
  }
}
