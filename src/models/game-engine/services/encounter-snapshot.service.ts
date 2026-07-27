import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CharacterEntity } from "src/entities/character.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { PersistentAreaEffectEntity } from "src/entities/persistent-area-effect.entity";
import {
  failure,
  GameErrorCode,
  GameResult,
  success,
} from "../interfaces/result.type";
import type {
  EncounterSnapshot,
  SnapshotParticipant,
  TileEffectSnapshot,
} from "../interfaces/encounter-snapshot.interface";
import { CombatService } from "./combat.service";
import { PersistentAreaService } from "./persistent-area.service";
import type { TurnActionBlock } from "../interfaces/combat.interfaces";

@Injectable()
export class EncounterSnapshotService {
  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(PersistentAreaEffectEntity)
    private readonly areaRepo: Repository<PersistentAreaEffectEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @Inject(forwardRef(() => CombatService))
    private readonly combatService: CombatService,
    private readonly persistentArea: PersistentAreaService,
  ) {}

  async build(
    encounterId: string,
    authUserId: string,
    actionParticipantId?: string | null,
  ): Promise<GameResult<EncounterSnapshot>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure(GameErrorCode.ENCOUNTER_NOT_FOUND);

    const [participants, areas] = await Promise.all([
      this.participantRepo.find({
        where: { encounterId: encounter.id },
        relations: ["monster"],
      }),
      this.areaRepo.find({
        where: { encounterId: encounter.id },
      }),
    ]);

    const currentTurnParticipantId =
      encounter.turnOrder[encounter.currentTurnIndex] ?? "";
    const actionsOwnerId =
      actionParticipantId === undefined
        ? currentTurnParticipantId
        : actionParticipantId;
    const [companionMeta, actorActions] = await Promise.all([
      this.buildPcCompanionMeta(participants),
      this.loadAvailableActions(encounter.id, actionsOwnerId, authUserId),
    ]);

    const snapParticipants: SnapshotParticipant[] = participants.map((p) => {
      const hp = resolveSnapshotHp(p);
      return {
        id: p.id,
        type: p.type,
        creatureType: p.monster?.type ?? null,
        isCompanion: companionMeta.get(p.id)?.isCompanion,
        companionTemplateId: companionMeta.get(p.id)?.companionTemplateId,
        faction: p.faction,
        displayName: p.displayName,
        controlledBy: p.controlledBy ?? "pc",
        position: {
          x: p.positionX ?? 0,
          y: p.positionY ?? 0,
        },
        positionX: p.positionX ?? 0,
        positionY: p.positionY ?? 0,
        hp: {
          current: hp.current,
          max: hp.max,
          tempHp: hp.tempHp,
        },
        dyingState: p.dyingState,
        conditions: p.conditions ?? [],
        actionEconomy: {
          actionUsed: p.actionUsed,
          bonusUsed: p.bonusActionUsed,
          movementRemaining: p.movementRemaining ?? 0,
          movementMax: p.movementRemaining ?? 30,
          reactionUsed: p.reactionsUsed > 0,
        },
        dodgingUntilTurnOfParticipantId: p.dodgingUntilTurnOfParticipantId,
        helpingAllyParticipantId: p.helpingAllyParticipantId,
        helpingTargetParticipantId: p.helpingTargetParticipantId,
        readiedAction: p.readiedAction,
        hidden: (p.conditions ?? []).includes("hidden"),
        isConcentrating: p.isConcentrating ?? false,
        concentratingOn: p.concentratingOn ?? null,

        statblockRef:
          (p.type === "monster" || p.type === "npc") && p.monster
            ? {
                monsterSlug: p.monster.slug ?? p.monster.name ?? "",
                actions: Array.isArray(p.monster.actions)
                  ? p.monster.actions
                  : [],
                intelligence: p.monster.intelligence ?? 10,
                wisdom: p.monster.wisdom ?? 10,
                speed: parseMonsterSpeedFt(p.monster.speed),
                multiattack: p.monster.multiattack ?? null,
                spellcasting: buildSpellcastingSnapshot(
                  p.monster.spellcasting ?? null,
                  (p.spellSlotsUsed ?? {}) as {
                    byLevel?: Record<number, number>;
                    innateUses?: Record<string, number>;
                  },
                ),
                bonusActions: extractBonusActions(
                  p.monster.actions,
                  p.monster.special_abilities,
                ),
                reactions: extractReactions(p.monster.reactions),
                legendaryActions: buildLegendaryActions(
                  p.monster.legendary_actions,
                  p.monster.legendary_action_cost_map ?? null,
                ),
                legendaryActionPointsRemaining:
                  p.legendaryPointsAvailable ?? undefined,
                legendaryActionPointsMax: p.legendaryPointsMax ?? undefined,
                lairActions: p.monster.lair_actions ?? [],
              }
            : undefined,
        availableActions: p.id === actionsOwnerId ? actorActions : [],
        distances: computeDistances(p, participants),
        canSee: computeVisibility(p, participants),
      } as SnapshotParticipant;
    });

    const tileEffects: TileEffectSnapshot[] = areas.map((a) => {
      const cells: Array<{ x: number; y: number }> = [];
      const r = a.radiusCells;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const x = a.originCell.x + dx;
          const y = a.originCell.y + dy;
          if (this.persistentArea.cellInArea(x, y, a)) cells.push({ x, y });
        }
      }
      const affecting = participants
        .filter(
          (p) =>
            p.positionX != null &&
            p.positionY != null &&
            this.persistentArea.cellInArea(p.positionX, p.positionY, a),
        )
        .map((p) => p.id);
      return {
        id: a.id,
        encounterId: a.encounterId,
        sourceSpellSlug: a.sourceSpell,
        sourceParticipantId: a.casterParticipantId,
        effectKind: a.effectKind,
        shapeKind: a.shapeKind,
        originCell: a.originCell,
        radiusCells: a.radiusCells,
        damageDice: a.damageDice,
        damageType: a.damageType,
        durationRoundsRemaining: a.durationRoundsRemaining,
        saveDc: a.saveDc,
        saveAbility: a.saveAbility,
        isDifficultTerrain: a.isDifficultTerrain,
        speedMultiplier: a.speedMultiplier,
        sourceConcentration: a.sourceConcentration,
        auraFollowsCaster: a.auraFollowsCaster ?? false,
        narrativeDescriptor: a.narrativeDescriptor,
        tactical: a.tacticalMetadata,
        cells,
        affectingParticipantIds: affecting,
      };
    });

    return success({
      encounterId: encounter.id,
      round: encounter.currentRound,
      currentTurnParticipantId,
      participants: snapParticipants,
      map: encounter.mapData
        ? {
            width:
              (encounter.mapData as { gridColumns?: number; gridSize?: number })
                .gridColumns ??
              (encounter.mapData as { gridSize?: number }).gridSize ??
              20,
            height:
              (encounter.mapData as { gridRows?: number; gridSize?: number })
                .gridRows ??
              (encounter.mapData as { gridSize?: number }).gridSize ??
              20,
          }
        : undefined,
      tileEffects,
      generatedAt: new Date().toISOString(),
    });
  }

  private async loadAvailableActions(
    encounterId: string,
    participantId: string | null,
    authUserId: string,
  ): Promise<TurnActionBlock[]> {
    if (!participantId) return [];
    try {
      const turnRes = await this.combatService.getTurnActions(
        encounterId,
        participantId,
        authUserId,
      );
      if (!turnRes.ok) return [];
      return [
        ...turnRes.value.actions,
        ...turnRes.value.bonusActions,
        ...turnRes.value.reactions,
      ];
    } catch {
      return [];
    }
  }

  private async buildPcCompanionMeta(
    participants: EncounterParticipantEntity[],
  ): Promise<
    Map<string, { isCompanion: boolean; companionTemplateId: string | null }>
  > {
    const meta = new Map<
      string,
      { isCompanion: boolean; companionTemplateId: string | null }
    >();
    const pcs = participants.filter((p) => p.type === "pc" && p.characterId);
    if (pcs.length === 0) return meta;
    const charIds = pcs.map((p) => p.characterId!);
    const characters = await this.characterRepo
      .createQueryBuilder("c")
      .select(["c.id", "c.ownerType", "c.companionTemplateId"])
      .where("c.id IN (:...ids)", { ids: charIds })
      .getMany();
    const byId = new Map(characters.map((c) => [c.id, c]));
    for (const p of pcs) {
      const character = byId.get(p.characterId!);
      meta.set(p.id, {
        isCompanion: character?.ownerType === "companion",
        companionTemplateId: character?.companionTemplateId ?? null,
      });
    }
    return meta;
  }
}

function resolveSnapshotHp(participant: EncounterParticipantEntity): {
  current: number;
  max: number;
  tempHp: number;
} {
  const transformation = participant.transformationState;
  const usesFormHp =
    transformation != null && transformation.rulesMode !== "xphb-wild-shape";
  if (usesFormHp) {
    return {
      current: transformation.form.currentHp,
      max: transformation.form.maxHp,
      tempHp: transformation.form.tempHp ?? participant.tempHp ?? 0,
    };
  }
  return {
    current: participant.currentHp ?? 0,
    max: participant.maxHp ?? 0,
    tempHp: participant.tempHp ?? 0,
  };
}

function computeDistances(
  self: EncounterParticipantEntity,
  all: EncounterParticipantEntity[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const other of all) {
    if (other.id === self.id) continue;
    const dx = (self.positionX ?? 0) - (other.positionX ?? 0);
    const dy = (self.positionY ?? 0) - (other.positionY ?? 0);
    out[other.id] = Math.ceil(Math.sqrt(dx * dx + dy * dy)) * 5;
  }
  return out;
}

function computeVisibility(
  self: EncounterParticipantEntity,
  all: EncounterParticipantEntity[],
): Record<string, boolean> {
  const out: Record<string, boolean> = {};

  for (const other of all) {
    if (other.id === self.id) continue;
    const otherHidden = (other.conditions ?? []).includes("hidden");

    out[other.id] = !otherHidden;
  }
  return out;
}

function parseMonsterSpeedFt(
  speed: Record<string, unknown> | null | undefined,
): number {
  if (!speed) return 30;
  const speeds = Object.values(speed)
    .map((value) => {
      if (typeof value === "number") return value;
      if (typeof value !== "string") return 0;
      const match = value.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((value) => value > 0);
  return speeds.length > 0 ? Math.max(...speeds) : 30;
}

function buildSpellcastingSnapshot(
  sc: unknown,
  used: {
    byLevel?: Record<number, number>;
    innateUses?: Record<string, number>;
  },
): SnapshotParticipant["statblockRef"] extends infer T
  ? T extends { spellcasting?: infer S }
    ? S
    : never
  : never {
  if (!sc || typeof sc !== "object") return null as never;
  const cast = sc as {
    type?: string;
    ability?: string;
    saveDc?: number;
    attackBonus?: number;
    knownSpells?: Array<{ slug: string; level: number; name?: string }>;
    slotsByLevel?: Record<string, number>;
    dailyUses?: Record<string, string>;
  };
  const slotsByLevel: Array<{
    level: number;
    total: number;
    remaining: number;
  }> = [];
  if (cast.slotsByLevel) {
    for (const [lvl, total] of Object.entries(cast.slotsByLevel)) {
      const level = parseInt(lvl, 10);
      if (!Number.isFinite(level) || typeof total !== "number") continue;
      const usedAtLevel = used.byLevel?.[level] ?? 0;
      slotsByLevel.push({
        level,
        total,
        remaining: Math.max(0, total - usedAtLevel),
      });
    }
  }
  const dailyUses: Array<{
    name: string;
    usesRemaining: number;
    usesMax: number;
  }> = [];
  if (cast.dailyUses) {
    for (const [name, usage] of Object.entries(cast.dailyUses)) {
      if (usage === "at-will") {
        dailyUses.push({ name, usesRemaining: 99, usesMax: 99 });
        continue;
      }
      const match = String(usage).match(/^(\d+)\/day$/);
      const max = match ? parseInt(match[1], 10) : 0;
      const usedCount = used.innateUses?.[name] ?? 0;
      dailyUses.push({
        name,
        usesRemaining: Math.max(0, max - usedCount),
        usesMax: max,
      });
    }
  }
  return {
    type: cast.type,
    ability: cast.ability,
    saveDc: cast.saveDc,
    attackBonus: cast.attackBonus,
    knownSpells: cast.knownSpells ?? [],
    slotsByLevel,
    dailyUses,
  } as never;
}

function extractBonusActions(
  actions: unknown,
  specialAbilities?: unknown,
): Array<{ name: string; description?: string }> {
  const list: Array<{ name: string; description?: string }> = [];
  const buckets: unknown[] = [actions, specialAbilities];
  for (const bucket of buckets) {
    const candidates = Array.isArray(bucket)
      ? bucket
      : bucket && typeof bucket === "object"
        ? Object.values(bucket as Record<string, unknown>)
        : [];
    for (const a of candidates) {
      if (!a || typeof a !== "object") continue;
      const obj = a as { name?: string; desc?: string; description?: string };
      if (!obj.name) continue;
      const text = `${obj.name} ${obj.desc ?? obj.description ?? ""}`;
      if (/bonus action/i.test(text)) {
        list.push({ name: obj.name, description: obj.desc ?? obj.description });
      }
    }
  }
  return list;
}

function extractReactions(
  reactions: unknown,
): Array<{ name: string; description?: string; trigger?: string }> {
  const list: Array<{ name: string; description?: string; trigger?: string }> =
    [];
  const candidates = Array.isArray(reactions)
    ? reactions
    : reactions && typeof reactions === "object"
      ? Object.values(reactions as Record<string, unknown>)
      : [];
  for (const a of candidates) {
    if (!a || typeof a !== "object") continue;
    const obj = a as {
      name?: string;
      desc?: string;
      description?: string;
      trigger?: string;
    };
    if (!obj.name) continue;
    list.push({
      name: obj.name,
      description: obj.desc ?? obj.description,
      trigger: obj.trigger,
    });
  }
  return list;
}

function buildLegendaryActions(
  legendaryActions: unknown,
  costMap: Record<string, 1 | 2 | 3> | null,
): Array<{ name: string; cost: 1 | 2 | 3; description?: string }> {
  const result: Array<{ name: string; cost: 1 | 2 | 3; description?: string }> =
    [];
  if (!legendaryActions) return result;
  const list = Array.isArray(legendaryActions)
    ? legendaryActions
    : ((legendaryActions as { actions?: unknown[] }).actions ?? []);
  if (!Array.isArray(list)) return result;
  for (const a of list) {
    if (!a || typeof a !== "object") continue;
    const obj = a as { name?: string; desc?: string; description?: string };
    if (!obj.name) continue;
    const cost = costMap?.[obj.name] ?? 1;
    result.push({
      name: obj.name,
      cost,
      description: obj.desc ?? obj.description,
    });
  }
  return result;
}
