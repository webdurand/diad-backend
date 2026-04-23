import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { DiceService } from './dice.service';
import { ConcentrationService } from './concentration.service';
import { ConditionLifecycleService } from './condition-lifecycle.service';
import { LegendaryActionService } from './legendary-action.service';
import { PersistentAreaService } from './persistent-area.service';
import { CapstonesService } from './capstones.service';
import type { GameEventData } from '../interfaces/result.type';
import type { SaveAbility } from '../interfaces/combat.interfaces';

/**
 * Spec 004 — Orquestra os ticks do início do turno (ordem RAW):
 *   1. Recharge: rola d6 para habilidades com `recharge: '5-6' | '6'`.
 *   2. Persistent area damage: criaturas dentro de áreas tomam dano + save.
 *   3. Concentração: decrementa duração; expira atomicamente se chegar a 0.
 *   4. Reset de pool de ações lendárias (se for turno do dono).
 *
 * Decremento de durações de condições no início de **round** é feito
 * separadamente em `decrementConditionDurationsAtRoundStart` (chamado uma vez
 * por round, não por turno).
 */
@Injectable()
export class StartTurnOrchestratorService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    private readonly dice: DiceService,
    private readonly concentration: ConcentrationService,
    private readonly conditions: ConditionLifecycleService,
    private readonly legendary: LegendaryActionService,
    private readonly persistentArea: PersistentAreaService,
    private readonly capstones: CapstonesService,
  ) {}

  /**
   * Roda os ticks de início de turno para um participante.
   * Ordem importa.
   */
  async run(
    participant: EncounterParticipantEntity,
    opts?: {
      isStartOfRound?: boolean;
      allParticipantsInRound?: EncounterParticipantEntity[];
      getSaveModifier?: (
        ability: SaveAbility,
      ) => Promise<{ modifier: number; advantage: boolean; disadvantage: boolean }>;
      ownerUserId?: string;
    },
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];

    // 0. Spec 012 Lote C — Capstones start-of-combat (Perfect Self, Arcane
    // Apotheosis, Superior Inspiration). CapstonesService skip se já processou
    // via marker effectInstance 'capstone_start_combat_done'.
    const capRes = await this.capstones.runStartOfCombat(participant, opts?.ownerUserId);
    events.push(...capRes.events);

    // 1. Recharge
    const r = await this.rollRecharges(participant);
    events.push(...r.events);

    // 2. Persistent area damage tick
    const padTick = await this.persistentArea.tickDamageFor(
      participant,
      opts?.getSaveModifier
        ? async (ability) => {
            const m = await opts.getSaveModifier!(ability);
            return { modifier: m.modifier };
          }
        : undefined,
    );
    events.push(...padTick.events);
    if (padTick.totalDamage > 0) {
      // Aplicar HP — caller é responsável pelo applyDamage canônico.
      // Aqui só emitimos eventos. combat.service consome `padTick.totalDamage`
      // se quiser aplicar via canal regular.
    }

    // 3. Concentração: decrementa duração
    const conc = await this.concentration.decrementDurationFor(participant);
    events.push(...conc.events);

    // 4. Reset legendary pool
    if (participant.legendaryPointsMax != null) {
      const pool = await this.legendary.resetPool(participant);
      events.push(...pool.events);
    }

    // Se é início de round, decrementar durações de condições não-end-of-turn
    if (opts?.isStartOfRound && opts.allParticipantsInRound?.length) {
      const decr = await this.conditions.decrementDurationsAtRoundStart(
        opts.allParticipantsInRound,
      );
      events.push(...decr.events);
      const padExpire = await this.persistentArea.decrementDurations(
        participant.encounterId,
      );
      events.push(...padExpire.events);
    }

    return { events };
  }

  private async rollRecharges(
    participant: EncounterParticipantEntity,
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    const m = participant.monster;
    if (!m) return { events };
    const allActions = [
      ...(this.toArray(m.actions) ?? []),
      ...(this.toArray(m.special_abilities) ?? []),
    ];
    const state = participant.rechargeState ?? {};
    let changed = false;
    for (const action of allActions) {
      if (!action || typeof action !== 'object') continue;
      const a = action as Record<string, unknown>;
      const recharge = (a.recharge ?? null) as string | null;
      if (recharge !== '5-6' && recharge !== '6') continue;
      const name = String(a.name ?? '');
      if (!name) continue;
      if (state[name] === 'used' || state[name] === undefined) {
        const roll = this.dice.roll(6);
        const recharged =
          recharge === '5-6' ? roll >= 5 : roll === 6;
        if (recharged) {
          state[name] = 'available';
          changed = true;
          events.push({
            event_type: 'recharge_rolled',
            actor_participant_id: participant.id,
            data: { actionName: name, rolled: roll, recharged: true, range: recharge },
          });
        } else if (state[name] === 'used') {
          events.push({
            event_type: 'recharge_rolled',
            actor_participant_id: participant.id,
            data: { actionName: name, rolled: roll, recharged: false, range: recharge },
          });
        }
      }
    }
    if (changed) {
      participant.rechargeState = state;
      await this.participants.save(participant);
    }
    return { events };
  }

  private toArray(raw: unknown): unknown[] | null {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'object') return Object.values(raw as Record<string, unknown>);
    return null;
  }
}
