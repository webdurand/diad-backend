import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PersistentAreaEffectEntity } from "src/entities/persistent-area-effect.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { DiceService } from "./dice.service";
import {
  getTileEffectDefinition,
  type TileEffectDirection,
  type TileEffectKind,
  type TileEffectOriginCell,
  type TileEffectTrigger,
  type ConditionSlug,
} from "./tile-effect-catalog";
import type { GameEventData } from "../interfaces/result.type";
import type { SaveAbility } from "../interfaces/combat.interfaces";

export interface CreatePersistentAreaInput {
  encounterId: string;
  casterParticipantId: string | null;
  sourceSpell: string;
  shapeKind: "sphere" | "cube" | "cylinder" | "line" | "cone";
  originCell: TileEffectOriginCell;
  radiusCells: number;
  damageDice: string;
  damageType: string;
  saveAbility?: SaveAbility | null;
  saveDc?: number | null;
  halfOnSave?: boolean;
  durationRoundsRemaining?: number | null;
  sourceConcentration?: boolean;
}


export interface CreateFromCatalogInput {
  encounterId: string;
  casterParticipantId: string;
  spellSlug: TileEffectKind;
  slotLevel: number;
  originCell: TileEffectOriginCell;
  saveDc: number;
}

export interface ResolveResult {
  events: GameEventData[];
  totalDamage: number;
  conditionsApplied: Array<{ targetId: string; slug: ConditionSlug }>;
  stopMovement: boolean;
}

type SaveModifierFn = (ability: SaveAbility) => Promise<{ modifier: number }>;

const LINE_DIRECTIONS: Record<TileEffectDirection, { dx: number; dy: number }> =
  {
    N: { dx: 0, dy: -1 },
    NE: { dx: 1, dy: -1 },
    E: { dx: 1, dy: 0 },
    SE: { dx: 1, dy: 1 },
    S: { dx: 0, dy: 1 },
    SW: { dx: -1, dy: 1 },
    W: { dx: -1, dy: 0 },
    NW: { dx: -1, dy: -1 },
  };

function normalizeLineDirection(
  direction: TileEffectOriginCell["direction"],
): TileEffectDirection {
  return direction && direction in LINE_DIRECTIONS
    ? direction
    : "E";
}

function cellsOnLine(
  start: { x: number; y: number },
  end: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const cells: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(start.x + (dx * i) / steps);
    const y = Math.round(start.y + (dy * i) / steps);
    const key = `${x},${y}`;
    if (!seen.has(key)) {
      seen.add(key);
      cells.push({ x, y });
    }
  }
  return cells;
}


@Injectable()
export class PersistentAreaService {
  constructor(
    @InjectRepository(PersistentAreaEffectEntity)
    private readonly areas: Repository<PersistentAreaEffectEntity>,
    private readonly dice: DiceService,
  ) {}



  async create(
    input: CreatePersistentAreaInput,
  ): Promise<PersistentAreaEffectEntity> {
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




  async createFromCatalog(
    input: CreateFromCatalogInput,
  ): Promise<PersistentAreaEffectEntity> {
    const def = getTileEffectDefinition(input.spellSlug);
    if (!def) {
      throw new Error(
        `tile-effect-catalog: spell "${input.spellSlug}" not registered`,
      );
    }
    const radius = def.defaultRadiusCells(input.slotLevel);
    const duration = def.durationRoundsAtSlot(input.slotLevel);





    const dmgTrigger =
      def.triggers.find((t) => t.kind === "on-start-turn-in" && t.damage) ??
      def.triggers.find((t) => t.kind === "on-cast" && t.damage) ??
      def.triggers.find((t) => t.kind === "on-move-through");
    const damageDice =
      dmgTrigger && "damage" in dmgTrigger && dmgTrigger.damage
        ? dmgTrigger.damage.expressionPerSlot(input.slotLevel)
        : dmgTrigger?.kind === "on-move-through"
          ? dmgTrigger.damagePerCell.expressionPerSlot(input.slotLevel)
          : "";
    const damageType =
      dmgTrigger && "damage" in dmgTrigger && dmgTrigger.damage
        ? dmgTrigger.damage.type
        : dmgTrigger?.kind === "on-move-through"
          ? dmgTrigger.damagePerCell.type
          : "";


    const saveTrigger = def.triggers.find((t) => "save" in t && t.save) as
      | Extract<TileEffectTrigger, { save?: unknown }>
      | undefined;
    const saveAbility = saveTrigger?.save?.ability ?? null;
    const halfOnSave = saveTrigger?.save?.halfOnSave ?? false;

    const entity = this.areas.create({
      encounterId: input.encounterId,
      casterParticipantId: input.casterParticipantId,
      sourceSpell: input.spellSlug,
      shapeKind: def.shapeKind,
      originCell: input.originCell,
      radiusCells: radius,
      damageDice,
      damageType,
      saveAbility,
      saveDc: input.saveDc,
      halfOnSave,
      durationRoundsRemaining: duration,
      sourceConcentration: def.sourceConcentration,

      effectKind: input.spellSlug,
      triggers: def.triggers,
      isDifficultTerrain: def.isDifficultTerrain,
      speedMultiplier: def.speedMultiplier ?? null,
      tacticalMetadata: def.tactical,
      narrativeDescriptor: def.narrativeDescriptor,
      slotLevel: input.slotLevel,
      auraFollowsCaster: def.auraFollowsCaster ?? false,
    });
    return this.areas.save(entity);
  }

  async listByEncounter(
    encounterId: string,
  ): Promise<PersistentAreaEffectEntity[]> {
    return this.areas.find({ where: { encounterId } });
  }


  async resolveOnCast(
    area: PersistentAreaEffectEntity,
    participantsInArea: EncounterParticipantEntity[],
    getSaveModifier?: SaveModifierFn,
  ): Promise<ResolveResult> {
    const result: ResolveResult = {
      events: [],
      totalDamage: 0,
      conditionsApplied: [],
      stopMovement: false,
    };
    if (!area.effectKind || !area.triggers) return result;

    const def = getTileEffectDefinition(area.effectKind);
    if (!def) return result;
    const slot = area.slotLevel ?? 1;

    const onCast = area.triggers.find((t) => t.kind === "on-cast");
    if (!onCast) return result;

    for (const target of participantsInArea) {
      if (target.isDefeated) continue;
      const partial = await this.dispatchTrigger(
        area,
        onCast,
        target,
        slot,
        getSaveModifier,
      );
      result.events.push(...partial.events);
      result.totalDamage += partial.damage;
      if (partial.conditionApplied) {
        result.conditionsApplied.push({
          targetId: target.id,
          slug: partial.conditionApplied,
        });
      }
    }
    return result;
  }


  async resolveEntry(
    participant: EncounterParticipantEntity,
    toCell: { x: number; y: number },
    encounterId: string,
    getSaveModifier?: SaveModifierFn,
  ): Promise<ResolveResult> {
    const result: ResolveResult = {
      events: [],
      totalDamage: 0,
      conditionsApplied: [],
      stopMovement: false,
    };
    if (participant.isDefeated) return result;

    const areas = await this.areas.find({ where: { encounterId } });
    const affecting = areas.filter(
      (a) => a.effectKind && this.cellInArea(toCell.x, toCell.y, a),
    );
    for (const area of affecting) {
      const onEnter = area.triggers?.find((t) => t.kind === "on-enter");
      if (!onEnter) continue;
      const slot = area.slotLevel ?? 1;
      const partial = await this.dispatchTrigger(
        area,
        onEnter,
        participant,
        slot,
        getSaveModifier,
      );
      result.events.push(...partial.events);
      result.totalDamage += partial.damage;
      if (partial.conditionApplied) {
        result.conditionsApplied.push({
          targetId: participant.id,
          slug: partial.conditionApplied,
        });

        if (area.speedMultiplier === 0 && !partial.savePassed) {
          result.stopMovement = true;
          result.events.push({
            event_type: "tile_effect_movement_stopped",
            target_participant_id: participant.id,
            data: {
              areaId: area.id,
              effectKind: area.effectKind,
              atCell: toCell,
              reason: "restrained-failed",
              narrativeDescriptor: area.narrativeDescriptor,
              tactical: area.tacticalMetadata,
            },
          });
        }
      }
    }
    return result;
  }


  async resolveMoveThrough(
    participant: EncounterParticipantEntity,
    cellsTraversed: Array<{ x: number; y: number }>,
    encounterId: string,
  ): Promise<ResolveResult> {
    const result: ResolveResult = {
      events: [],
      totalDamage: 0,
      conditionsApplied: [],
      stopMovement: false,
    };
    if (participant.isDefeated || cellsTraversed.length === 0) return result;

    const areas = await this.areas.find({ where: { encounterId } });
    const moveThruAreas = areas.filter((a) =>
      a.triggers?.some((t) => t.kind === "on-move-through"),
    );
    if (moveThruAreas.length === 0) return result;

    for (const cell of cellsTraversed) {
      for (const area of moveThruAreas) {
        if (!this.cellInArea(cell.x, cell.y, area)) continue;
        const trig = area.triggers!.find((t) => t.kind === "on-move-through");
        if (!trig || trig.kind !== "on-move-through") continue;
        const slot = area.slotLevel ?? 1;
        const expr = trig.damagePerCell.expressionPerSlot(slot);
        const damage = this.rollExpression(expr);
        result.totalDamage += damage;
        result.events.push({
          event_type: "tile_effect_damage_applied",
          target_participant_id: participant.id,
          data: {
            areaId: area.id,
            effectKind: area.effectKind,
            triggerKind: "on-move-through",
            expression: expr,
            type: trig.damagePerCell.type,
            amount: damage,
            cell,
            narrativeDescriptor: this.buildMoveThroughNarrative(
              area,
              participant,
              damage,
              trig.damagePerCell.type,
            ),
            tactical: area.tacticalMetadata,
          },
        });
      }
    }
    return result;
  }


  async resolveStartTurnIn(
    participant: EncounterParticipantEntity,
    getSaveModifier?: SaveModifierFn,
  ): Promise<ResolveResult> {
    const result: ResolveResult = {
      events: [],
      totalDamage: 0,
      conditionsApplied: [],
      stopMovement: false,
    };
    if (
      participant.positionX == null ||
      participant.positionY == null ||
      participant.isDefeated
    ) {
      return result;
    }
    const areas = await this.areas.find({
      where: { encounterId: participant.encounterId },
    });
    const affecting = areas.filter((a) =>
      this.cellInArea(participant.positionX!, participant.positionY!, a),
    );
    for (const area of affecting) {

      if (area.effectKind && area.triggers) {
        const trig = area.triggers.find((t) => t.kind === "on-start-turn-in");
        if (trig) {
          const slot = area.slotLevel ?? 1;
          const partial = await this.dispatchTrigger(
            area,
            trig,
            participant,
            slot,
            getSaveModifier,
          );
          result.events.push(...partial.events);
          result.totalDamage += partial.damage;
          if (partial.conditionApplied) {
            result.conditionsApplied.push({
              targetId: participant.id,
              slug: partial.conditionApplied,
            });
          }
        }
        continue;
      }

      const legacy = await this.tickDamageForArea(
        area,
        participant,
        getSaveModifier,
      );
      result.events.push(...legacy.events);
      result.totalDamage += legacy.totalDamage;
    }
    return result;
  }


  async tickDamageFor(
    participant: EncounterParticipantEntity,
    getSaveModifier?: SaveModifierFn,
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
      const r = await this.tickDamageForArea(a, participant, getSaveModifier);
      events.push(...r.events);
      totalDamage += r.totalDamage;
    }
    return { events, totalDamage, affectingAreas: affecting };
  }


  private async tickDamageForArea(
    a: PersistentAreaEffectEntity,
    participant: EncounterParticipantEntity,
    getSaveModifier?: SaveModifierFn,
  ): Promise<{ events: GameEventData[]; totalDamage: number }> {
    let damage = a.damageDice ? this.rollExpression(a.damageDice) : 0;
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
    return {
      events: [
        {
          event_type: a.effectKind
            ? "tile_effect_damage_applied"
            : "persistent_area_tick",
          target_participant_id: participant.id,
          data: {
            areaId: a.id,
            sourceSpell: a.sourceSpell,
            effectKind: a.effectKind,
            triggerKind: "on-start-turn-in",
            expression: a.damageDice,
            type: a.damageType,
            amount: damage,
            saveResult,
            narrativeDescriptor: a.narrativeDescriptor,
            tactical: a.tacticalMetadata,
          },
        },
      ],
      totalDamage: damage,
    };
  }


  async resolveEndTurnAdjacent(
    participant: EncounterParticipantEntity,
    getSaveModifier?: SaveModifierFn,
  ): Promise<ResolveResult> {
    const result: ResolveResult = {
      events: [],
      totalDamage: 0,
      conditionsApplied: [],
      stopMovement: false,
    };
    if (
      participant.positionX == null ||
      participant.positionY == null ||
      participant.isDefeated
    ) {
      return result;
    }
    const areas = await this.areas.find({
      where: { encounterId: participant.encounterId },
    });
    for (const area of areas) {
      if (!area.effectKind || !area.triggers) continue;
      const trig = area.triggers.find((t) => t.kind === "on-end-turn-adjacent");
      if (!trig || trig.kind !== "on-end-turn-adjacent") continue;

      const dx = participant.positionX - area.originCell.x;
      const dy = participant.positionY - area.originCell.y;
      const chebyshev = Math.max(Math.abs(dx), Math.abs(dy));
      if (chebyshev > area.radiusCells + trig.range) continue;
      const slot = area.slotLevel ?? 1;
      const partial = await this.dispatchTrigger(
        area,
        trig,
        participant,
        slot,
        getSaveModifier,
      );
      result.events.push(...partial.events);
      result.totalDamage += partial.damage;
    }
    return result;
  }




  private async dispatchTrigger(
    area: PersistentAreaEffectEntity,
    trigger: TileEffectTrigger,
    target: EncounterParticipantEntity,
    slot: number,
    getSaveModifier?: SaveModifierFn,
  ): Promise<{
    events: GameEventData[];
    damage: number;
    conditionApplied: ConditionSlug | null;
    savePassed: boolean;
  }> {
    const events: GameEventData[] = [];
    let damage = 0;
    let conditionApplied: ConditionSlug | null = null;
    let savePassed = true;






    let saveData: {
      rolled: number;
      passed: boolean;
      modifier: number;
      total: number;
    } | null = null;
    const save = "save" in trigger ? trigger.save : undefined;
    if (save && area.saveDc != null) {
      const m = getSaveModifier
        ? await getSaveModifier(save.ability)
        : { modifier: 0 };
      const r = this.dice.roll(20);
      const total = r + m.modifier;
      const passed = total >= area.saveDc;
      saveData = { rolled: r, modifier: m.modifier, total, passed };
      savePassed = passed;
      events.push({
        event_type: "tile_effect_save_rolled",
        target_participant_id: target.id,
        data: {
          areaId: area.id,
          effectKind: area.effectKind,
          triggerKind: trigger.kind,
          ability: save.ability,
          dc: area.saveDc,
          rolled: r,
          modifier: m.modifier,
          total,
          passed,
          narrativeDescriptor: area.narrativeDescriptor,
        },
      });

      if (!passed && save.onFailCondition) {
        conditionApplied = save.onFailCondition;
        events.push({
          event_type: "tile_effect_condition_applied",
          target_participant_id: target.id,
          data: {
            areaId: area.id,
            effectKind: area.effectKind,
            conditionSlug: save.onFailCondition,
            narrativeDescriptor: area.narrativeDescriptor,
            tactical: area.tacticalMetadata,
          },
        });
      }
    }


    let damageSpec:
      | { expressionPerSlot: (s: number) => string; type: string }
      | undefined;
    if (trigger.kind === "on-move-through") {
      damageSpec = trigger.damagePerCell;
    } else if (
      trigger.kind === "on-cast" ||
      trigger.kind === "on-enter" ||
      trigger.kind === "on-start-turn-in" ||
      trigger.kind === "on-end-turn-adjacent" ||
      trigger.kind === "on-pass-through-wall"
    ) {
      damageSpec = trigger.damage;
    }
    if (damageSpec) {
      const expr = damageSpec.expressionPerSlot(slot);
      let amount = this.rollExpression(expr);
      if (saveData && saveData.passed) {
        amount = save?.halfOnSave ? Math.floor(amount / 2) : 0;
      }
      damage = amount;
      events.push({
        event_type: "tile_effect_damage_applied",
        target_participant_id: target.id,
        data: {
          areaId: area.id,
          effectKind: area.effectKind,
          triggerKind: trigger.kind,
          expression: expr,
          type: damageSpec.type,
          amount,
          saveResult: saveData,
          narrativeDescriptor: this.buildDamageNarrative(
            area,
            target,
            amount,
            damageSpec.type,
            trigger.kind,
          ),
          tactical: area.tacticalMetadata,
        },
      });
    }

    return { events, damage, conditionApplied, savePassed };
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
          event_type: a.effectKind
            ? "tile_effect_expired"
            : "persistent_area_expired",
          data: {
            areaId: a.id,
            sourceSpell: a.sourceSpell,
            effectKind: a.effectKind,
            reason: "duration",
            narrativeDescriptor: a.narrativeDescriptor,
          },
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
    reason: "concentration_broken" | "concentration_replaced" =
      "concentration_broken",
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    const areas = await this.areas.find({
      where: { casterParticipantId, sourceConcentration: true },
    });
    for (const a of areas) {
      events.push({
        event_type: a.effectKind
          ? "tile_effect_concentration_broken"
          : "persistent_area_removed",
        data: {
          areaId: a.id,
          sourceSpell: a.sourceSpell,
          effectKind: a.effectKind,
          casterId: casterParticipantId,
          reason,
          narrativeDescriptor: a.narrativeDescriptor,
        },
      });
    }
    if (areas.length) {
      await this.areas.delete(areas.map((a) => a.id));
    }
    return { events };
  }


  async relocateAurasByCaster(
    casterParticipantId: string,
    newCell: { x: number; y: number },
  ): Promise<void> {
    const areas = await this.areas.find({ where: { casterParticipantId } });
    for (const a of areas) {


      if (!a.auraFollowsCaster) continue;
      a.originCell = newCell;
      await this.areas.save(a);
    }
  }


  async getDifficultTerrainOverlay(
    encounterId: string,
  ): Promise<Map<string, number>> {
    const overlay = new Map<string, number>();
    const areas = await this.areas.find({ where: { encounterId } });
    for (const a of areas) {
      if (!a.isDifficultTerrain) continue;
      const mult = a.speedMultiplier ?? 0.5;

      for (const cell of this.cellsCovered(a)) {
        const key = `${cell.x},${cell.y}`;

        const prev = overlay.get(key);
        if (prev === undefined || mult < prev) overlay.set(key, mult);
      }
    }
    return overlay;
  }



  cellInArea(x: number, y: number, area: PersistentAreaEffectEntity): boolean {
    const dx = x - area.originCell.x;
    const dy = y - area.originCell.y;
    if (area.shapeKind === "sphere" || area.shapeKind === "cylinder") {


      return Math.sqrt(dx * dx + dy * dy) <= area.radiusCells;
    }
    if (area.shapeKind === "cube") {
      return (
        Math.abs(dx) <= area.radiusCells && Math.abs(dy) <= area.radiusCells
      );
    }
    if (area.shapeKind === "line") {
      if (area.originCell.end) {
        return cellsOnLine(area.originCell, area.originCell.end).some(
          (cell) => cell.x === x && cell.y === y,
        );
      }
      const direction = LINE_DIRECTIONS[
        normalizeLineDirection(area.originCell.direction)
      ];
      const length = Math.max(1, area.radiusCells);

      if (direction.dx === 0) {
        return dx === 0 && dy * direction.dy >= 0 && Math.abs(dy) < length;
      }

      if (direction.dy === 0) {
        return dy === 0 && dx * direction.dx >= 0 && Math.abs(dx) < length;
      }

      const stepX = dx / direction.dx;
      const stepY = dy / direction.dy;
      return stepX === stepY && stepX >= 0 && stepX < length;
    }
    return Math.max(Math.abs(dx), Math.abs(dy)) <= area.radiusCells;
  }


  private cellsCovered(
    area: PersistentAreaEffectEntity,
  ): Array<{ x: number; y: number }> {
    const cells: Array<{ x: number; y: number }> = [];
    const r = area.radiusCells;
    const ox = area.originCell.x;
    const oy = area.originCell.y;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const x = ox + dx;
        const y = oy + dy;
        if (this.cellInArea(x, y, area)) cells.push({ x, y });
      }
    }
    return cells;
  }

  private rollExpression(expr: string): number {
    if (!expr) return 0;
    return this.dice.rollExpression(expr).total;
  }



  private buildDamageNarrative(
    area: PersistentAreaEffectEntity,
    target: EncounterParticipantEntity,
    damage: number,
    type: string,
    triggerKind: string,
  ): string {
    const name = target.displayName || "Alvo";
    const verb = this.verbForTrigger(triggerKind);
    const text = `${name} ${verb} ${area.narrativeDescriptor ? "— " + this.shortKind(area) : ""}: ${damage} ${type}.`;
    return text.length > 120 ? text.slice(0, 117) + "..." : text;
  }

  private buildMoveThroughNarrative(
    area: PersistentAreaEffectEntity,
    target: EncounterParticipantEntity,
    damage: number,
    type: string,
  ): string {
    const name = target.displayName || "Alvo";
    const text = `${name} atravessa ${this.shortKind(area)}: ${damage} ${type}.`;
    return text.length > 120 ? text.slice(0, 117) + "..." : text;
  }

  private verbForTrigger(kind: string): string {
    switch (kind) {
      case "on-cast":
        return "é atingido por";
      case "on-enter":
        return "pisa em";
      case "on-start-turn-in":
        return "sofre dentro de";
      case "on-end-turn-adjacent":
        return "queima ao lado de";
      case "on-pass-through-wall":
        return "atravessa";
      default:
        return "é afetado por";
    }
  }

  private shortKind(area: PersistentAreaEffectEntity): string {
    const k = area.effectKind ?? area.sourceSpell;
    const labels: Record<string, string> = {
      grease: "graxa",
      web: "teia",
      "spike-growth": "espinhos",
      "wall-of-fire": "parede de fogo",
      "cloud-of-daggers": "nuvem de adagas",
      "sleet-storm": "tempestade de granizo",
      "spirit-guardians": "guardiões espectrais",
    };
    return labels[k] ?? k;
  }
}
