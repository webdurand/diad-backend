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
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import {
  isCellWithinWallHotZone,
  pathCrossesWall,
} from "./wall-of-fire-geometry";
import { getStormOfVengeancePhase } from "./storm-of-vengeance";

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
  casterFaction?: "ally" | "enemy" | "neutral";
  damageDiceOverride?: string;
  damageTypeOverride?: "cold" | "fire" | "lightning" | "thunder" | "force";
  currentRound?: number;
}

export interface ResolveResult {
  events: GameEventData[];
  totalDamage: number;
  conditionsApplied: Array<{ targetId: string; slug: ConditionSlug }>;
  stopMovement: boolean;
}

type SaveModifierFn = (
  ability: SaveAbility,
  target?: EncounterParticipantEntity,
) => Promise<{
  modifier: number;
  advantage?: boolean;
  disadvantage?: boolean;
  autoFail?: boolean;
}>;

interface RelocateAuraContext {
  participants: EncounterParticipantEntity[];
  getSaveModifier?: SaveModifierFn;
  turnKey?: string;
  persistParticipant?: (
    participant: EncounterParticipantEntity,
  ) => Promise<unknown>;
}

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

function cubeOffsetRange(sizeCells: number): { start: number; end: number } {
  const size = Math.max(1, Math.floor(sizeCells));
  const start = -Math.floor((size - 1) / 2);
  return { start, end: start + size - 1 };
}


@Injectable()
export class PersistentAreaService {
  constructor(
    @InjectRepository(PersistentAreaEffectEntity)
    private readonly areas: Repository<PersistentAreaEffectEntity>,
    private readonly dice: DiceService,
    private readonly conditionLifecycle: ConditionLifecycleService,
  ) {}

  private alreadyTriggeredThisTurn(
    area: PersistentAreaEffectEntity,
    participant: EncounterParticipantEntity,
    turnKey?: string,
  ): boolean {
    if (!turnKey) return false;
    return (participant.effectInstances ?? []).some(
      (effect) =>
        (effect.kind === "tile_effect_turn_trigger_marker" ||
          effect.kind === "tile_effect_entry_marker") &&
        effect.payload.areaId === area.id &&
        effect.payload.turnKey === turnKey,
    );
  }

  private markTriggeredThisTurn(
    area: PersistentAreaEffectEntity,
    participant: EncounterParticipantEntity,
    turnKey?: string,
  ): void {
    if (!turnKey || this.alreadyTriggeredThisTurn(area, participant, turnKey)) {
      return;
    }
    participant.effectInstances = [
      ...(participant.effectInstances ?? []),
      {
        id: `tile-trigger:${area.id}:${turnKey}`,
        sourceSpellSlug: area.sourceSpell,
        sourceCasterParticipantId:
          area.casterParticipantId ?? participant.id,
        kind: "tile_effect_turn_trigger_marker",
        payload: { areaId: area.id, turnKey },
        expiresAt: { kind: "until_target_turn", value: 1 },
        requiresConcentration: false,
        appliedAt: new Date().toISOString(),
      },
    ];
  }



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
      def.triggers.find((t) => t.kind === "on-move-through") ??
      def.triggers.find(
        (t) =>
          ("damage" in t && Boolean(t.damage)) ||
          (t.kind === "on-move-through" && Boolean(t.damagePerCell)),
      );
    const damageDice =
      input.damageDiceOverride ??
      (dmgTrigger && "damage" in dmgTrigger && dmgTrigger.damage
        ? dmgTrigger.damage.expressionPerSlot(input.slotLevel)
        : dmgTrigger?.kind === "on-move-through"
          ? dmgTrigger.damagePerCell.expressionPerSlot(input.slotLevel)
          : "");
    const catalogDamageType =
      dmgTrigger && "damage" in dmgTrigger && dmgTrigger.damage
        ? dmgTrigger.damage.type
        : dmgTrigger?.kind === "on-move-through"
          ? dmgTrigger.damagePerCell.type
          : "";
    const damageType = input.damageTypeOverride ?? catalogDamageType;


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
      tacticalMetadata: {
        ...def.tactical,
        ...(input.casterFaction
          ? { casterFaction: input.casterFaction }
          : {}),
        ...(input.damageTypeOverride && input.damageTypeOverride !== "force"
          ? { elementalDamageType: input.damageTypeOverride }
          : {}),
        ...(input.currentRound != null
          ? { createdRound: input.currentRound }
          : {}),
      },
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

  async resolveStormOfVengeanceTurn(
    caster: EncounterParticipantEntity,
    currentRound: number,
    participants: EncounterParticipantEntity[],
    getSaveModifier?: SaveModifierFn,
  ): Promise<ResolveResult> {
    const result: ResolveResult = {
      events: [],
      totalDamage: 0,
      conditionsApplied: [],
      stopMovement: false,
    };
    const areas = await this.areas.find({
      where: { encounterId: caster.encounterId },
    });
    const area = areas.find(
      (candidate) =>
        candidate.effectKind === "storm-of-vengeance" &&
        candidate.casterParticipantId === caster.id,
    );
    if (!area) return result;

    const metadata = area.tacticalMetadata ?? {
      tags: [],
      tacticalValue: 10,
      beneficiaryFaction: "caster" as const,
    };
    const createdRound = Number(metadata.createdRound ?? currentRound);
    if (metadata.lastResolvedRound === currentRound) return result;

    const phase = getStormOfVengeancePhase(createdRound, currentRound);
    if (!phase) return result;

    let eligible = participants.filter(
      (target) =>
        !target.isDefeated &&
        target.positionX != null &&
        target.positionY != null &&
        this.cellInArea(target.positionX, target.positionY, area),
    );
    if (phase.maxTargets != null) {
      eligible = eligible
        .filter((target) => target.faction !== caster.faction)
        .slice(0, phase.maxTargets);
    }

    const trigger: Extract<TileEffectTrigger, { kind: "on-start-turn-in" }> = {
      kind: "on-start-turn-in",
      damage: {
        expressionPerSlot: () => phase.damageExpression,
        type: phase.damageType,
      },
      ...(phase.saveAbility
        ? {
            save: {
              ability: phase.saveAbility,
              halfOnSave: phase.halfOnSave,
            },
          }
        : {}),
    };
    const sharedDamageRoll = this.rollExpression(phase.damageExpression);

    for (const target of eligible) {
      const partial = await this.dispatchTrigger(
        area,
        trigger,
        target,
        area.slotLevel ?? 9,
        getSaveModifier,
        sharedDamageRoll,
      );
      result.events.push(
        ...partial.events.map((event) => ({
          ...event,
          data: {
            ...(event.data ?? {}),
            stormRound: phase.round,
          },
        })),
      );
      result.totalDamage += partial.damage;
    }

    area.tacticalMetadata = {
      ...metadata,
      lastResolvedRound: currentRound,
    };
    await this.areas.save(area);
    result.events.unshift({
      event_type: "storm_of_vengeance_phase",
      actor_participant_id: caster.id,
      data: {
        areaId: area.id,
        stormRound: phase.round,
        damageExpression: phase.damageExpression,
        damageRoll: sharedDamageRoll,
        damageType: phase.damageType,
        targets: eligible.map((target) => target.id),
      },
    });
    return result;
  }

  async relocate(
    area: PersistentAreaEffectEntity,
    originCell: TileEffectOriginCell,
  ): Promise<PersistentAreaEffectEntity> {
    area.originCell = originCell;
    return this.areas.save(area);
  }


  async resolveOnCast(
    area: PersistentAreaEffectEntity,
    participantsInArea: EncounterParticipantEntity[],
    getSaveModifier?: SaveModifierFn,
    turnKey?: string,
  ): Promise<ResolveResult> {
    const result: ResolveResult = {
      events: [],
      totalDamage: 0,
      conditionsApplied: [],
      stopMovement: false,
    };
    if (!area.effectKind) return result;

    const def = getTileEffectDefinition(area.effectKind);
    if (!def) return result;
    const slot = area.slotLevel ?? 1;

    const onCast = this.runtimeTriggers(area).find(
      (t) => t.kind === "on-cast",
    );
    if (!onCast) return result;

    for (const target of participantsInArea) {
      if (target.isDefeated || !this.canAffectTarget(area, target)) continue;
      if (
        onCast.kind === "on-cast" &&
        onCast.oncePerTurn &&
        this.alreadyTriggeredThisTurn(area, target, turnKey)
      ) {
        continue;
      }
      const partial = await this.dispatchTrigger(
        area,
        onCast,
        target,
        slot,
        getSaveModifier,
      );
      if (onCast.oncePerTurn) {
        this.markTriggeredThisTurn(area, target, turnKey);
      }
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
    turnKey?: string,
    fromCell?: { x: number; y: number },
  ): Promise<ResolveResult> {
    const result: ResolveResult = {
      events: [],
      totalDamage: 0,
      conditionsApplied: [],
      stopMovement: false,
    };
    if (participant.isDefeated) return result;

    const areas = await this.areas.find({ where: { encounterId } });
    const affecting = areas.filter((a) => {
      if (!a.effectKind) return false;
      if (a.effectKind === "conjure-elemental") {
        return (
          this.cellInLargeCore(toCell.x, toCell.y, a) &&
          (!fromCell ||
            !this.cellInLargeCore(fromCell.x, fromCell.y, a))
        );
      }
      return (
        this.cellInArea(toCell.x, toCell.y, a) &&
        (!fromCell || !this.cellInArea(fromCell.x, fromCell.y, a))
      );
    });
    for (const area of affecting) {
      if (!this.canAffectTarget(area, participant)) continue;
      const onEnter = this.runtimeTriggers(area).find(
        (t) => t.kind === "on-enter",
      );
      if (!onEnter) continue;
      if (
        onEnter.kind === "on-enter" &&
        onEnter.oncePerTurn &&
        turnKey &&
        this.alreadyTriggeredThisTurn(area, participant, turnKey)
      ) {
        continue;
      }
      const slot = area.slotLevel ?? 1;
      const partial = await this.dispatchTrigger(
        area,
        onEnter,
        participant,
        slot,
        getSaveModifier,
      );
      if (onEnter.oncePerTurn && turnKey) {
        this.markTriggeredThisTurn(area, participant, turnKey);
      }
      result.events.push(...partial.events);
      result.totalDamage += partial.damage;
      if (partial.conditionApplied) {
        result.conditionsApplied.push({
          targetId: participant.id,
          slug: partial.conditionApplied,
        });

        if (
          (area.speedMultiplier === 0 ||
            area.effectKind === "conjure-elemental") &&
          !partial.savePassed
        ) {
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

  async removeLocationBoundConditionsOutsideAreas(
    participant: EncounterParticipantEntity,
    cell: { x: number; y: number },
  ): Promise<GameEventData[]> {
    const truthBindings = (participant.conditionInstances ?? []).filter(
      (instance) =>
        instance.slug === "truth_bound" &&
        instance.sourceSpell
          ?.toLowerCase()
          .replace(/-(phb|xphb|srd52)$/, "") === "zone-of-truth",
    );
    if (truthBindings.length === 0) return [];

    const zones = await this.areas.find({
      where: {
        encounterId: participant.encounterId,
        effectKind: "zone-of-truth",
      },
    });
    const events: GameEventData[] = [];
    for (const binding of truthBindings) {
      const stillBound = zones.some(
        (zone) =>
          zone.casterParticipantId === binding.appliedBy &&
          this.cellInArea(cell.x, cell.y, zone),
      );
      if (stillBound) continue;
      const removed = await this.conditionLifecycle.removeConditionInstance(
        participant,
        binding.id,
        "left_area",
      );
      events.push(...removed.events);
    }
    return events;
  }


  async resolveMoveThrough(
    participant: EncounterParticipantEntity,
    cellsTraversed: Array<{ x: number; y: number }>,
    encounterId: string,
    turnKey?: string,
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
      this.runtimeTriggers(a).some((t) => t.kind === "on-move-through"),
    );
    const wallAreas = areas.filter((area) =>
      this.runtimeTriggers(area).some(
        (trigger) => trigger.kind === "on-pass-through-wall",
      ),
    );
    if (moveThruAreas.length === 0 && wallAreas.length === 0) return result;

    for (const cell of cellsTraversed) {
      for (const area of moveThruAreas) {
        if (!this.cellInArea(cell.x, cell.y, area)) continue;
        const trig = this.runtimeTriggers(area).find(
          (t) => t.kind === "on-move-through",
        );
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

    for (const area of wallAreas) {
      const trigger = this.runtimeTriggers(area).find(
        (candidate) => candidate.kind === "on-pass-through-wall",
      );
      if (!trigger || trigger.kind !== "on-pass-through-wall") continue;
      if (
        !pathCrossesWall(cellsTraversed, area.originCell, area.radiusCells)
      ) {
        continue;
      }
      if (
        trigger.oncePerTurn &&
        this.alreadyTriggeredThisTurn(area, participant, turnKey)
      ) {
        continue;
      }
      const partial = await this.dispatchTrigger(
        area,
        trigger,
        participant,
        area.slotLevel ?? 1,
      );
      if (trigger.oncePerTurn) {
        this.markTriggeredThisTurn(area, participant, turnKey);
      }
      result.events.push(...partial.events);
      result.totalDamage += partial.damage;
    }
    return result;
  }


  async resolveStartTurnIn(
    participant: EncounterParticipantEntity,
    getSaveModifier?: SaveModifierFn,
    turnKey?: string,
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
      const restrainedByThisElemental =
        area.effectKind === "conjure-elemental" &&
        this.isRestrainedByArea(area, participant);
      if (restrainedByThisElemental) {
        const repeat = this.runtimeTriggers(area).find(
          (trigger) => trigger.kind === "on-restrained-start-turn",
        );
        if (repeat && repeat.kind === "on-restrained-start-turn") {
          const partial = await this.dispatchTrigger(
            area,
            repeat,
            participant,
            area.slotLevel ?? 1,
            getSaveModifier,
          );
          result.events.push(...partial.events);
          result.totalDamage += partial.damage;
        }
        continue;
      }
      if (
        !this.cellInArea(
          participant.positionX,
          participant.positionY,
          area,
        )
      ) {
        continue;
      }
      if (!this.canAffectTarget(area, participant)) continue;

      if (area.effectKind) {
        const alreadyTruthBoundByThisZone =
          area.effectKind === "zone-of-truth" &&
          (participant.conditionInstances ?? []).some(
            (instance) =>
              instance.slug === "truth_bound" &&
              instance.appliedBy === area.casterParticipantId &&
              instance.sourceSpell
                ?.toLowerCase()
                .replace(/-(phb|xphb|srd52)$/, "") === "zone-of-truth",
          );
        if (alreadyTruthBoundByThisZone) continue;

        const alreadyRestrainedByThisWeb =
          area.effectKind === "web" &&
          (participant.conditionInstances ?? []).some(
            (instance) =>
              instance.slug === "restrained" &&
              instance.appliedBy === area.casterParticipantId &&
              instance.sourceSpell
                ?.toLowerCase()
                .replace(/-(phb|xphb|srd52)$/, "") === "web",
          );
        if (alreadyRestrainedByThisWeb) continue;

        const trig = this.runtimeTriggers(area).find(
          (t) => t.kind === "on-start-turn-in",
        );
        if (trig) {
          if (
            trig.oncePerTurn &&
            this.alreadyTriggeredThisTurn(area, participant, turnKey)
          ) {
            continue;
          }
          const slot = area.slotLevel ?? 1;
          const partial = await this.dispatchTrigger(
            area,
            trig,
            participant,
            slot,
            getSaveModifier,
          );
          if (trig.oncePerTurn) {
            this.markTriggeredThisTurn(area, participant, turnKey);
          }
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
            saveAbility: a.saveAbility,
            halfOnSave: a.halfOnSave,
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
      if (!area.effectKind) continue;
      const trig = this.runtimeTriggers(area).find(
        (t) => t.kind === "on-end-turn-adjacent",
      );
      if (!trig || trig.kind !== "on-end-turn-adjacent") continue;

      if (
        !isCellWithinWallHotZone(
          { x: participant.positionX, y: participant.positionY },
          area.originCell,
          area.radiusCells,
          trig.range,
        )
      ) {
        continue;
      }
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

  async resolveAreaMovedInto(
    area: PersistentAreaEffectEntity,
    participants: EncounterParticipantEntity[],
    previousOrigin: TileEffectOriginCell,
    getSaveModifier?: SaveModifierFn,
    turnKey?: string,
  ): Promise<ResolveResult> {
    const result: ResolveResult = {
      events: [],
      totalDamage: 0,
      conditionsApplied: [],
      stopMovement: false,
    };
    if (!area.effectKind) return result;

    const trigger = this.runtimeTriggers(area).find(
      (candidate) => candidate.kind === "on-area-moved-into",
    );
    if (!trigger || trigger.kind !== "on-area-moved-into") return result;

    for (const target of participants) {
      if (
        target.isDefeated ||
        !this.canAffectTarget(area, target) ||
        target.positionX == null ||
        target.positionY == null ||
        !this.cellInArea(target.positionX, target.positionY, area) ||
        this.cellInAreaForOrigin(
          target.positionX,
          target.positionY,
          area,
          previousOrigin,
        )
      ) {
        continue;
      }
      if (
        trigger.oncePerTurn &&
        this.alreadyTriggeredThisTurn(area, target, turnKey)
      ) {
        continue;
      }
      const partial = await this.dispatchTrigger(
        area,
        trigger,
        target,
        area.slotLevel ?? 1,
        getSaveModifier,
      );
      if (trigger.oncePerTurn) {
        this.markTriggeredThisTurn(area, target, turnKey);
      }
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

  async resolveEndTurnIn(
    participant: EncounterParticipantEntity,
    getSaveModifier?: SaveModifierFn,
    turnKey?: string,
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
      if (
        !area.effectKind ||
        !this.canAffectTarget(area, participant) ||
        !this.cellInArea(
          participant.positionX,
          participant.positionY,
          area,
        )
      ) {
        continue;
      }
      const trigger = this.runtimeTriggers(area).find(
        (candidate) => candidate.kind === "on-end-turn-in",
      );
      if (!trigger || trigger.kind !== "on-end-turn-in") continue;
      if (
        trigger.oncePerTurn &&
        this.alreadyTriggeredThisTurn(area, participant, turnKey)
      ) {
        continue;
      }
      const partial = await this.dispatchTrigger(
        area,
        trigger,
        participant,
        area.slotLevel ?? 1,
        getSaveModifier,
      );
      if (trigger.oncePerTurn) {
        this.markTriggeredThisTurn(area, participant, turnKey);
      }
      result.events.push(...partial.events);
      result.totalDamage += partial.damage;
      if (partial.conditionApplied) {
        result.conditionsApplied.push({
          targetId: participant.id,
          slug: partial.conditionApplied,
        });
      }
    }

    return result;
  }




  private async dispatchTrigger(
    area: PersistentAreaEffectEntity,
    trigger: TileEffectTrigger,
    target: EncounterParticipantEntity,
    slot: number,
    getSaveModifier?: SaveModifierFn,
    damageRollOverride?: number,
  ): Promise<{
    events: GameEventData[];
    damage: number;
    conditionApplied: ConditionSlug | null;
    savePassed: boolean;
  }> {
    const events: GameEventData[] = [];
    let damage = 0;
    let conditionApplied: ConditionSlug | null = null;
    let pendingCondition: ConditionSlug | null = null;
    let savePassed = true;

    if (area.auraFollowsCaster && target.id === area.casterParticipantId) {
      return { events, damage, conditionApplied, savePassed };
    }





    let saveData: {
      rolled: number;
      passed: boolean;
      modifier: number;
      total: number;
    } | null = null;
    const save = "save" in trigger ? trigger.save : undefined;
    if (save && area.saveDc != null) {
      const m = getSaveModifier
        ? await getSaveModifier(save.ability, target)
        : { modifier: 0 };
      const firstRoll = this.dice.roll(20);
      const secondRoll =
        m.advantage || m.disadvantage ? this.dice.roll(20) : firstRoll;
      const r = m.advantage
        ? Math.max(firstRoll, secondRoll)
        : m.disadvantage
          ? Math.min(firstRoll, secondRoll)
          : firstRoll;
      const total = r + m.modifier;
      const passed = !m.autoFail && total >= area.saveDc;
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
          advantage: m.advantage ?? false,
          disadvantage: m.disadvantage ?? false,
          autoFail: m.autoFail ?? false,
          narrativeDescriptor: area.narrativeDescriptor,
        },
      });

      if (!passed && save.onFailCondition) {
        pendingCondition = save.onFailCondition;
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
      trigger.kind === "on-area-moved-into" ||
      trigger.kind === "on-restrained-start-turn" ||
      trigger.kind === "on-start-turn-in" ||
      trigger.kind === "on-end-turn-in" ||
      trigger.kind === "on-end-turn-adjacent" ||
      trigger.kind === "on-pass-through-wall"
    ) {
      damageSpec = trigger.damage;
    }
    if (damageSpec) {
      const expr = damageSpec.expressionPerSlot(slot);
      const resolvedDamageType =
        area.effectKind === "conjure-elemental" && area.damageType
          ? area.damageType
          : damageSpec.type;
      let amount = damageRollOverride ?? this.rollExpression(expr);
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
          type: resolvedDamageType,
          amount,
          saveResult: saveData,
          saveAbility: save?.ability,
          halfOnSave: save?.halfOnSave ?? false,
          narrativeDescriptor: this.buildDamageNarrative(
            area,
            target,
            amount,
            resolvedDamageType,
            trigger.kind,
          ),
          tactical: area.tacticalMetadata,
        },
      });
    }

    const normalizedAreaSpell = area.sourceSpell
      .toLowerCase()
      .replace(/-(phb|xphb|srd52)$/, "");
    if (
      pendingCondition &&
      !(target.conditionInstances ?? []).some(
        (instance) =>
          instance.slug === pendingCondition &&
          instance.appliedBy === area.casterParticipantId &&
          instance.sourceSpell
            ?.toLowerCase()
            .replace(/-(phb|xphb|srd52)$/, "") === normalizedAreaSpell,
      )
    ) {
      const applied = await this.conditionLifecycle.applyCondition(target, {
        slug: pendingCondition,
        appliedBy: area.casterParticipantId,
        sourceSpell: area.sourceSpell,
        // Falling prone is an instantaneous result of the failed save. It
        // remains until the creature stands even if the originating area ends.
        sourceConcentration:
          area.sourceConcentration && pendingCondition !== "prone",
        saveAbility: save?.ability ?? null,
        saveDc: area.saveDc,
        repeatSaveTiming: "never",
        durationRoundsRemaining:
          pendingCondition === "prone"
            ? null
            : area.durationRoundsRemaining,
      });
      const wasApplied = applied.events.some(
        (event) => event.event_type === "condition_applied",
      );
      if (wasApplied) {
        conditionApplied = pendingCondition;
        events.push({
          event_type: "tile_effect_condition_applied",
          target_participant_id: target.id,
          data: {
            areaId: area.id,
            effectKind: area.effectKind,
            conditionSlug: pendingCondition,
            narrativeDescriptor: area.narrativeDescriptor,
            tactical: area.tacticalMetadata,
          },
        });
      }
      events.push(...applied.events);
      if (area.effectKind === "conjure-elemental" && wasApplied) {
        area.tacticalMetadata = {
          ...(area.tacticalMetadata ?? {
            tags: ["damage", "control", "restrained"],
            tacticalValue: 9,
            beneficiaryFaction: "caster",
          }),
          restrainedTargetId: target.id,
        };
        await this.areas.save(area);
      }
    }

    if (
      area.effectKind === "conjure-elemental" &&
      trigger.kind === "on-restrained-start-turn" &&
      saveData?.passed
    ) {
      const restrained = (target.conditionInstances ?? []).find(
        (instance) =>
          instance.slug === "restrained" &&
          instance.appliedBy === area.casterParticipantId &&
          instance.sourceSpell
            ?.toLowerCase()
            .replace(/-(phb|xphb|srd52)$/, "") === "conjure-elemental",
      );
      if (restrained) {
        const removed = await this.conditionLifecycle.removeConditionInstance(
          target,
          restrained.id,
          "target_saved",
        );
        events.push(...removed.events);
      }
      area.tacticalMetadata = {
        ...(area.tacticalMetadata ?? {
          tags: ["damage", "control", "restrained"],
          tacticalValue: 9,
          beneficiaryFaction: "caster",
        }),
        restrainedTargetId: null,
      };
      await this.areas.save(area);
    }

    if (
      !savePassed &&
      save?.affectsConcentration &&
      target.isConcentrating
    ) {
      events.push(
        ...(await this.conditionLifecycle.breakConcentration(
          target,
          "sleet_storm_failed_save",
        )),
      );
    }

    return { events, damage, conditionApplied, savePassed };
  }

  /**
   * JSONB cannot preserve the executable damage calculators from the catalog.
   * Rehydrate catalog-backed triggers whenever a persisted area is resolved.
   */
  private runtimeTriggers(
    area: PersistentAreaEffectEntity,
  ): TileEffectTrigger[] {
    if (area.effectKind) {
      const definition = getTileEffectDefinition(area.effectKind);
      if (definition) return definition.triggers;
    }
    return area.triggers ?? [];
  }

  private canAffectTarget(
    area: PersistentAreaEffectEntity,
    target: EncounterParticipantEntity,
  ): boolean {
    const tactical = area.tacticalMetadata;
    if (
      area.effectKind === "conjure-elemental" &&
      tactical?.restrainedTargetId &&
      tactical.restrainedTargetId !== target.id
    ) {
      return false;
    }
    if (tactical?.targeting !== "hostile_only") return true;
    if (!tactical.casterFaction) return true;
    return target.faction !== tactical.casterFaction;
  }

  private cellInLargeCore(
    x: number,
    y: number,
    area: PersistentAreaEffectEntity,
  ): boolean {
    return (
      x >= area.originCell.x &&
      x <= area.originCell.x + 1 &&
      y >= area.originCell.y &&
      y <= area.originCell.y + 1
    );
  }

  private isRestrainedByArea(
    area: PersistentAreaEffectEntity,
    target: EncounterParticipantEntity,
  ): boolean {
    return (target.conditionInstances ?? []).some(
      (instance) =>
        instance.slug === "restrained" &&
        instance.appliedBy === area.casterParticipantId &&
        instance.sourceSpell
          ?.toLowerCase()
          .replace(/-(phb|xphb|srd52)$/, "") === "conjure-elemental",
    );
  }

  async releaseConjureElementalTarget(
    target: EncounterParticipantEntity,
    reason: "target_defeated" | "target_removed" = "target_defeated",
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    const areas = await this.areas.find({
      where: {
        encounterId: target.encounterId,
        effectKind: "conjure-elemental",
      },
    });

    for (const area of areas) {
      if (area.tacticalMetadata?.restrainedTargetId !== target.id) continue;

      const restrainedInstances = (target.conditionInstances ?? []).filter(
        (instance) =>
          instance.slug === "restrained" &&
          instance.appliedBy === area.casterParticipantId &&
          instance.sourceSpell
            ?.toLowerCase()
            .replace(/-(phb|xphb|srd52)$/, "") === "conjure-elemental",
      );
      for (const instance of restrainedInstances) {
        const removed =
          await this.conditionLifecycle.removeConditionInstance(
            target,
            instance.id,
            reason,
          );
        events.push(...removed.events);
      }

      area.tacticalMetadata = {
        ...(area.tacticalMetadata ?? {
          tags: ["damage", "control", "restrained"],
          tacticalValue: 9,
          beneficiaryFaction: "caster",
        }),
        restrainedTargetId: null,
      };
      await this.areas.save(area);
      events.push({
        event_type: "tile_effect_target_released",
        target_participant_id: target.id,
        data: {
          areaId: area.id,
          effectKind: area.effectKind,
          reason,
        },
      });
    }

    return { events };
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

  async recordGuardianOfFaithDamage(
    areaId: string,
    damageApplied: number,
    targetParticipantId?: string,
  ): Promise<GameEventData[]> {
    if (!Number.isFinite(damageApplied) || damageApplied <= 0) return [];
    const area = await this.areas.findOne({ where: { id: areaId } });
    if (!area || area.effectKind !== "guardian-of-faith") return [];

    const tactical = area.tacticalMetadata ?? {
      tags: ["damage", "guardian", "stationary", "large", "radiant"],
      tacticalValue: 9,
      beneficiaryFaction: "caster" as const,
      targeting: "hostile_only" as const,
      damageBudgetTotal: 60,
      damageDealtTotal: 0,
    };
    const damageBudgetTotal = Math.max(
      1,
      Number(tactical.damageBudgetTotal ?? 60),
    );
    const damageDealtTotal =
      Math.max(0, Number(tactical.damageDealtTotal ?? 0)) + damageApplied;
    const damageRemaining = Math.max(
      0,
      damageBudgetTotal - damageDealtTotal,
    );

    if (damageDealtTotal >= damageBudgetTotal) {
      await this.areas.delete(area.id);
      return [
        {
          event_type: "guardian_of_faith_vanished",
          actor_participant_id: area.casterParticipantId ?? undefined,
          target_participant_id: targetParticipantId,
          data: {
            areaId: area.id,
            sourceSpell: area.sourceSpell,
            effectKind: area.effectKind,
            damageApplied,
            damageDealtTotal,
            damageBudgetTotal,
            damageRemaining,
            reason: "damage_budget",
          },
        },
      ];
    }

    area.tacticalMetadata = {
      ...tactical,
      damageBudgetTotal,
      damageDealtTotal,
    };
    await this.areas.save(area);
    return [
      {
        event_type: "guardian_of_faith_damage_budget",
        actor_participant_id: area.casterParticipantId ?? undefined,
        target_participant_id: targetParticipantId,
        data: {
          areaId: area.id,
          sourceSpell: area.sourceSpell,
          effectKind: area.effectKind,
          damageApplied,
          damageDealtTotal,
          damageBudgetTotal,
          damageRemaining,
        },
      },
    ];
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

  async removeByCasterAndSpell(
    casterParticipantId: string,
    sourceSpell: string,
    reason: "recast" | "expired" = "recast",
  ): Promise<{ events: GameEventData[] }> {
    const normalizedSource = sourceSpell
      .trim()
      .toLowerCase()
      .replace(/-(phb|xphb|srd52)$/, "");
    const areas = (await this.areas.find({ where: { casterParticipantId } }))
      .filter(
        (area) =>
          area.sourceSpell
            .trim()
            .toLowerCase()
            .replace(/-(phb|xphb|srd52)$/, "") === normalizedSource,
      );
    if (areas.length > 0) {
      await this.areas.delete(areas.map((area) => area.id));
    }
    return {
      events: areas.map((area) => ({
        event_type: "tile_effect_removed",
        actor_participant_id: casterParticipantId,
        data: {
          areaId: area.id,
          sourceSpell: area.sourceSpell,
          effectKind: area.effectKind,
          reason,
          narrativeDescriptor: area.narrativeDescriptor,
        },
      })),
    };
  }


  async relocateAurasByCaster(
    casterParticipantId: string,
    newCell: { x: number; y: number },
    context?: RelocateAuraContext,
  ): Promise<ResolveResult> {
    const result: ResolveResult = {
      events: [],
      totalDamage: 0,
      conditionsApplied: [],
      stopMovement: false,
    };
    const areas = await this.areas.find({ where: { casterParticipantId } });
    for (const a of areas) {
      if (!a.auraFollowsCaster) continue;
      const previousOrigin = { ...a.originCell };
      a.originCell = newCell;
      await this.areas.save(a);

      if (!context) continue;
      const onEnter = this.runtimeTriggers(a).find(
        (trigger) => trigger.kind === "on-enter",
      );
      if (!onEnter || onEnter.kind !== "on-enter") continue;

      const newlyEnveloped = context.participants.filter(
        (participant) =>
          participant.id !== casterParticipantId &&
          !participant.isDefeated &&
          participant.positionX != null &&
          participant.positionY != null &&
          this.cellInArea(participant.positionX, participant.positionY, a) &&
          !this.cellInAreaForOrigin(
            participant.positionX,
            participant.positionY,
            a,
            previousOrigin,
          ),
      );
      for (const participant of newlyEnveloped) {
        if (
          onEnter.oncePerTurn &&
          context.turnKey &&
          this.alreadyTriggeredThisTurn(a, participant, context.turnKey)
        ) {
          continue;
        }
        const partial = await this.dispatchTrigger(
          a,
          onEnter,
          participant,
          a.slotLevel ?? 1,
          context.getSaveModifier,
        );
        if (onEnter.oncePerTurn) {
          this.markTriggeredThisTurn(a, participant, context.turnKey);
          await context.persistParticipant?.(participant);
        }
        result.events.push(...partial.events);
        result.totalDamage += partial.damage;
        if (partial.conditionApplied) {
          result.conditionsApplied.push({
            targetId: participant.id,
            slug: partial.conditionApplied,
          });
        }
      }
    }
    return result;
  }

  private cellInAreaForOrigin(
    x: number,
    y: number,
    area: PersistentAreaEffectEntity,
    originCell: TileEffectOriginCell,
  ): boolean {
    const currentOrigin = area.originCell;
    area.originCell = originCell;
    try {
      return this.cellInArea(x, y, area);
    } finally {
      area.originCell = currentOrigin;
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
      return area.auraFollowsCaster
        ? Math.max(Math.abs(dx), Math.abs(dy)) <= area.radiusCells
        : Math.sqrt(dx * dx + dy * dy) <= area.radiusCells;
    }
    if (area.shapeKind === "cube") {
      const { start, end } = cubeOffsetRange(area.radiusCells);
      return dx >= start && dx <= end && dy >= start && dy <= end;
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
    const range =
      area.shapeKind === "cube"
        ? cubeOffsetRange(r)
        : { start: -r, end: r };
    for (let dx = range.start; dx <= range.end; dx++) {
      for (let dy = range.start; dy <= range.end; dy++) {
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
