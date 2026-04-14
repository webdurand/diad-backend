import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PersistentAreaEffectEntity } from 'src/entities/persistent-area-effect.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { DiceService } from './dice.service';
import type { GameEventData } from '../interfaces/result.type';
import type { SaveAbility } from '../interfaces/combat.interfaces';

export interface CreatePersistentAreaInput {
  encounterId: string;
  casterParticipantId: string | null;
  sourceSpell: string;
  shapeKind: 'sphere' | 'cube' | 'cylinder' | 'line' | 'cone';
  originCell: { x: number; y: number };
  radiusCells: number;
  damageDice: string;
  damageType: string;
  saveAbility?: SaveAbility | null;
  saveDc?: number | null;
  halfOnSave?: boolean;
  durationRoundsRemaining?: number | null;
  sourceConcentration?: boolean;
}

/**
 * Spec 004 — Persistent area effects (Spirit Guardians, Wall of Fire, etc.).
 *
 * - `create`: instancia o efeito (geralmente chamado em spell-casting).
 * - `tickDamageFor`: chamado em start-of-turn pra cada criatura — se está dentro
 *    de alguma área, rola dano + save.
 * - `decrementDurations`: rotina de fim/início de round.
 * - `removeByCasterConcentrationBreak`: cascata via concentration.service.
 */
@Injectable()
export class PersistentAreaService {
  constructor(
    @InjectRepository(PersistentAreaEffectEntity)
    private readonly areas: Repository<PersistentAreaEffectEntity>,
    private readonly dice: DiceService,
  ) {}

  async create(input: CreatePersistentAreaInput): Promise<PersistentAreaEffectEntity> {
    const entity = this.areas.create({
      encounterId: input.encounterId,
      casterParticipantId: input.casterParticipantId,
      sourceSpell: input.sourceSpell,
      shapeKind: input.shapeKind,
      originCell: input.originCell,
      radiusCells: input.radiusCells,
      damageDice: input.damageDice,
      damageType: input.damageType,
      saveAbility: input.saveAbility ?? null,
      saveDc: input.saveDc ?? null,
      halfOnSave: input.halfOnSave ?? false,
      durationRoundsRemaining: input.durationRoundsRemaining ?? null,
      sourceConcentration: input.sourceConcentration ?? false,
    });
    return this.areas.save(entity);
  }

  async tickDamageFor(
    participant: EncounterParticipantEntity,
    getSaveModifier?: (
      ability: SaveAbility,
    ) => Promise<{ modifier: number }>,
  ): Promise<{
    events: GameEventData[];
    totalDamage: number;
    affectingAreas: PersistentAreaEffectEntity[];
  }> {
    if (
      participant.positionX == null ||
      participant.positionY == null ||
      participant.isDefeated
    ) {
      return { events: [], totalDamage: 0, affectingAreas: [] };
    }
    const areas = await this.areas.find({
      where: { encounterId: participant.encounterId },
    });
    const affecting = areas.filter((a) =>
      this.cellInArea(participant.positionX!, participant.positionY!, a),
    );
    let totalDamage = 0;
    const events: GameEventData[] = [];
    for (const a of affecting) {
      // Skip se for a própria caster (algumas magias excluem o caster da área).
      // Por padrão, RAW: caster sofre se está dentro. Mantemos default RAW.
      let damage = this.rollExpression(a.damageDice);
      let saveResult: {
        rolled: number;
        passed: boolean;
        modifier: number;
        total: number;
      } | null = null;
      if (a.saveAbility && a.saveDc != null && getSaveModifier) {
        const m = await getSaveModifier(a.saveAbility);
        const r = this.dice.roll(20);
        const total = r + m.modifier;
        const passed = total >= a.saveDc;
        saveResult = { rolled: r, modifier: m.modifier, total, passed };
        if (passed) {
          damage = a.halfOnSave ? Math.floor(damage / 2) : 0;
        }
      }
      totalDamage += damage;
      events.push({
        event_type: 'persistent_area_tick',
        target_participant_id: participant.id,
        data: {
          areaId: a.id,
          sourceSpell: a.sourceSpell,
          damageRoll: a.damageDice,
          damageType: a.damageType,
          damage,
          saveResult,
        },
      });
    }
    return { events, totalDamage, affectingAreas: affecting };
  }

  async decrementDurations(encounterId: string): Promise<{
    events: GameEventData[];
    expired: PersistentAreaEffectEntity[];
  }> {
    const areas = await this.areas.find({ where: { encounterId } });
    const events: GameEventData[] = [];
    const expired: PersistentAreaEffectEntity[] = [];
    for (const a of areas) {
      if (a.durationRoundsRemaining == null) continue;
      a.durationRoundsRemaining -= 1;
      if (a.durationRoundsRemaining <= 0) {
        expired.push(a);
        events.push({
          event_type: 'persistent_area_expired',
          data: { areaId: a.id, sourceSpell: a.sourceSpell },
        });
      } else {
        await this.areas.save(a);
      }
    }
    if (expired.length) {
      await this.areas.delete(expired.map((e) => e.id));
    }
    return { events, expired };
  }

  async removeByCasterConcentrationBreak(
    casterParticipantId: string,
  ): Promise<void> {
    await this.areas.delete({ casterParticipantId, sourceConcentration: true });
  }

  private cellInArea(
    x: number,
    y: number,
    area: PersistentAreaEffectEntity,
  ): boolean {
    const dx = x - area.originCell.x;
    const dy = y - area.originCell.y;
    if (area.shapeKind === 'sphere' || area.shapeKind === 'cylinder') {
      return Math.sqrt(dx * dx + dy * dy) <= area.radiusCells;
    }
    if (area.shapeKind === 'cube') {
      return Math.abs(dx) <= area.radiusCells && Math.abs(dy) <= area.radiusCells;
    }
    // Line/cone: simplificação — checa raio chebyshev como bounding box (refinar em iteração futura).
    return Math.max(Math.abs(dx), Math.abs(dy)) <= area.radiusCells;
  }

  private rollExpression(expr: string): number {
    return this.dice.rollExpression(expr).total;
  }
}
