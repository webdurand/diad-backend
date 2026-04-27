import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PersistentAreaEffectEntity } from "src/entities/persistent-area-effect.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { DiceService } from "./dice.service";
import {
  TILE_EFFECT_CATALOG,
  getTileEffectDefinition,
  type TileEffectDefinition,
  type TileEffectKind,
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

/** Spec 013 — input pra `createFromCatalog`. Catalog dita shape/triggers/etc. */
export interface CreateFromCatalogInput {
  encounterId: string;
  casterParticipantId: string;
  spellSlug: TileEffectKind;
  slotLevel: number;
  originCell: { x: number; y: number };
  saveDc: number;
}

export interface ResolveResult {
  events: GameEventData[];
  totalDamage: number;
  conditionsApplied: Array<{ targetId: string; slug: ConditionSlug }>;
  stopMovement: boolean;
}

type SaveModifierFn = (ability: SaveAbility) => Promise<{ modifier: number }>;

/**
 * Spec 004 (legacy) + Spec 013 (ground effects).
 *
 * Áreas persistentes que duram além do turno do caster: Spirit Guardians, Wall
 * of Fire, Cloud of Daggers, Moonbeam, Spike Growth, Grease, Web, Sleet Storm.
 *
 * Spec 004 path (legacy, registros sem `effectKind`):
 *  - `create()`              — instancia via input cru
 *  - `tickDamageFor()`       — usado em start-of-turn (orchestrator dormant)
 *  - `decrementDurations()`  — fim de round
 *  - `removeByCasterConcentrationBreak()` — cascata de concentration
 *
 * Spec 013 path (registros com `effectKind` setado, triggers[] dita comportamento):
 *  - `createFromCatalog()`       — instancia via TILE_EFFECT_CATALOG
 *  - `resolveOnCast()`           — Grease save adjacents, Wall of Fire 5d8 inicial
 *  - `resolveEntry()`            — save-on-enter + condition (Grease/Web/Sleet)
 *  - `resolveMoveThrough()`      — Spike Growth 2d4 per cell, no save
 *  - `resolveStartTurnIn()`      — Cloud of Daggers, Spirit Guardians, Sleet Storm
 *  - `resolveEndTurnAdjacent()`  — Wall of Fire heat side
 *  - `getDifficultTerrainOverlay()` — overlay dinâmico de difficult cells
 *
 * Damage application: methods retornam `totalDamage` + `events` com damage info;
 * caller é responsável por aplicar HP (mantém pattern do legacy `tickDamageFor`).
 * Frontend renderiza damage via events.
 */
@Injectable()
export class PersistentAreaService {
  constructor(
    @InjectRepository(PersistentAreaEffectEntity)
    private readonly areas: Repository<PersistentAreaEffectEntity>,
    private readonly dice: DiceService,
  ) {}

  // ── Spec 004 legacy path (preserved) ───────────────────────────────────

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

  // ── Spec 013 path (catalog-driven) ─────────────────────────────────────

  /**
   * Instancia via catalog. ZERO branch hardcoded por spell — adicionar magia
   * nova = entry no catalog. Princípio X 3 camadas snapshotted na entity:
   * tactical_metadata + narrative_descriptor + triggers[].
   */
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

    // Damage RAW snapshot — pega expression de qualquer trigger com damage
    // (start-turn-in preferred, fallback on-cast, fallback on-pass-through).
    // Damage real de cada trigger usa expressionPerSlot do catalog em runtime,
    // mas snapshot top-level mantém compat com tickDamageFor legacy + queries.
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

    // Save snapshot — primeiro trigger com save define o top-level (compat).
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
      // Spec 013 fields
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

  /**
   * Dispara triggers `on-cast` para uma área recém-criada.
   * Ex: Grease — DEX save em todos os adjacents dentro da área.
   * Ex: Wall of Fire — 5d8 fire (DEX half) em criaturas dentro do path.
   */
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

  /**
   * Spec 013 — quando criatura entra num cell. Dispara on-enter triggers.
   * Web pode retornar `stopMovement:true` (speedMultiplier=0 + save fail).
   * Caller (movement.service) deve interromper iteração de cells.
   */
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
        // Web (speedMultiplier=0): save fail → stop movement.
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

  /**
   * Spec 013 — Spike Growth: damage per cell movido através da área.
   * RAW: NO save, automatic per 5ft. Sem dependência de save modifier.
   */
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

  /**
   * Spec 013 — start-of-turn IN tile: Spirit Guardians, Cloud of Daggers,
   * Sleet Storm, Spike Growth (auto-damage if creature is inside).
   *
   * Backward compat: registros sem `effectKind` ainda usam `tickDamageFor`
   * (delega abaixo).
   */
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
      // Catalog-aware: usa triggers[] e expressionPerSlot.
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
          continue;
        }
      }
      // Legacy path (Spec 004) — registros sem effectKind.
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

  /**
   * Spec 004 legacy entry-point. Mantém pra orchestrator dormant + compat.
   * Spec 013: prefira `resolveStartTurnIn`.
   */
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

  /** Damage tick legado para uma área específica (Spec 004 path). */
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

  /**
   * Spec 013 — Wall of Fire heat side: criaturas adjacentes (range:1) ao tile
   * sofrem damage no fim do turno. Caller (combat.endTurn ou similar) chama.
   */
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
      // Critério: está DENTRO ou ADJACENTE (Chebyshev ≤ trig.range) ao tile.
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

  // ── Helper Strategy: dispatch por trigger.kind ─────────────────────────

  /**
   * Strategy core. Dado um trigger + participant, retorna events + damage +
   * condition (Princípio X aware).
   */
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

    // 1. Save (se trigger tem save + saveDc setado na área).
    // Spec 013: se getSaveModifier não for fornecido (PATCH position path),
    // default pra modifier=0. Save ainda rola — RAW per default a criatura
    // sem proficiency gets +0 mod. Isso preserva eventos save_rolled +
    // condition_applied que probes esperam.
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
      // Save fail → aplica condition se trigger especifica
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

    // 2. Damage (se trigger tem damage)
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

  // ── Spec 004 lifecycle (preserved) ─────────────────────────────────────

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

  /**
   * Spec 004 + Spec 013 — cascade quando concentration quebra.
   * Emite `tile_effect_concentration_broken` pra registros novos (effectKind set);
   * `persistent_area_removed` pra legacy. Garante backward compat com Spec 004.
   */
  async removeByCasterConcentrationBreak(
    casterParticipantId: string,
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
          reason: "concentration_broken",
          narrativeDescriptor: a.narrativeDescriptor,
        },
      });
    }
    if (areas.length) {
      await this.areas.delete(areas.map((a) => a.id));
    }
    return { events };
  }

  /**
   * Spec 012 + Spec 013 — recentraliza aura em torno do caster (Spirit Guardians
   * e qualquer registro com `auraFollowsCaster=true`).
   */
  async relocateAurasByCaster(
    casterParticipantId: string,
    newCell: { x: number; y: number },
  ): Promise<void> {
    const areas = await this.areas.find({ where: { casterParticipantId } });
    for (const a of areas) {
      // Spec 013: usa flag boolean (popula via createFromCatalog ou backfill).
      // Backward compat: legacy Spirit Guardians backfilled em migration.
      if (!a.auraFollowsCaster) continue;
      a.originCell = newCell;
      await this.areas.save(a);
    }
  }

  /**
   * Spec 013 — overlay dinâmico de difficult terrain.
   * movement.service merge com `difficultTerrainCells` estático antes de
   * calcular cost. speedMultiplier=0 → cell de stop (Web fail save).
   */
  async getDifficultTerrainOverlay(
    encounterId: string,
  ): Promise<Map<string, number>> {
    const overlay = new Map<string, number>();
    const areas = await this.areas.find({ where: { encounterId } });
    for (const a of areas) {
      if (!a.isDifficultTerrain) continue;
      const mult = a.speedMultiplier ?? 0.5; // default 0.5 = ×2 cost
      // Enumera cells da área (fallback shape-based).
      for (const cell of this.cellsCovered(a)) {
        const key = `${cell.x},${cell.y}`;
        // Stack: pega mult mais agressiva (0 = stop wins).
        const prev = overlay.get(key);
        if (prev === undefined || mult < prev) overlay.set(key, mult);
      }
    }
    return overlay;
  }

  // ── Geometry helpers ───────────────────────────────────────────────────

  cellInArea(x: number, y: number, area: PersistentAreaEffectEntity): boolean {
    const dx = x - area.originCell.x;
    const dy = y - area.originCell.y;
    if (area.shapeKind === "sphere" || area.shapeKind === "cylinder") {
      // Chebyshev RAW 5e (diagonal=5ft); legacy usava Euclidean — mantido
      // pra compat com Spirit Guardians (refatorável em spec futura).
      return Math.sqrt(dx * dx + dy * dy) <= area.radiusCells;
    }
    if (area.shapeKind === "cube") {
      return (
        Math.abs(dx) <= area.radiusCells && Math.abs(dy) <= area.radiusCells
      );
    }
    if (area.shapeKind === "line") {
      // Line: bounding box até radiusCells de comprimento, 1 cell de largura.
      // Direção implícita pela origem; aproximação Chebyshev.
      return Math.abs(dx) <= area.radiusCells && Math.abs(dy) <= 0;
    }
    return Math.max(Math.abs(dx), Math.abs(dy)) <= area.radiusCells;
  }

  /** Enumera cells cobertas por uma área (pra overlay). */
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

  // ── Princípio X camada 3 — narrativa ───────────────────────────────────

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
