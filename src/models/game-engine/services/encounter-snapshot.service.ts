import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
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
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { CombatService } from "./combat.service";
import { PersistentAreaService } from "./persistent-area.service";
import type { TurnActionBlock } from "../interfaces/combat.interfaces";


@Injectable()
export class EncounterSnapshotService {
  private readonly logger = new Logger(EncounterSnapshotService.name);

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
    private readonly sheetService: CharacterSheetService,
  ) {}

  async build(
    encounterId: string,
    authUserId: string,
  ): Promise<GameResult<EncounterSnapshot>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure(GameErrorCode.ENCOUNTER_NOT_FOUND);

    const participants = await this.participantRepo.find({
      where: { encounterId: encounter.id },
      relations: ["monster"],
    });








    const pcOverlay = await this.buildPcSheetOverlay(participants);
    const companionMeta = await this.buildPcCompanionMeta(participants);

    const currentTurnParticipantId =
      encounter.turnOrder[encounter.currentTurnIndex] ?? "";

    const snapParticipants: SnapshotParticipant[] = await Promise.all(
      participants.map(async (p) => {


        let availableActions: TurnActionBlock[] = [];
        try {
          const turnRes = await this.combatService.getTurnActions(
            encounter.id,
            p.id,
            authUserId,
          );
          if (turnRes.ok) {
            availableActions = [
              ...turnRes.value.actions,
              ...turnRes.value.bonusActions,
              ...turnRes.value.reactions,
            ];
          }
        } catch {

        }

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
            current: pcOverlay.get(p.id)?.currentHp ?? p.currentHp ?? 0,
            max: pcOverlay.get(p.id)?.maxHp ?? p.maxHp ?? 0,
            tempHp: pcOverlay.get(p.id)?.tempHp ?? p.tempHp,
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
          availableActions,
          distances: computeDistances(p, participants),
          canSee: computeVisibility(p, participants),
        } as SnapshotParticipant;
      }),
    );


    const areas = await this.areaRepo.find({
      where: { encounterId: encounter.id },
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


  private async buildPcSheetOverlay(
    participants: EncounterParticipantEntity[],
  ): Promise<
    Map<string, { currentHp: number; maxHp: number; tempHp: number }>
  > {
    const overlay = new Map<
      string,
      { currentHp: number; maxHp: number; tempHp: number }
    >();
    const pcs = participants.filter((p) => p.type === "pc" && p.characterId);
    if (pcs.length === 0) return overlay;

    const charIds = pcs.map((p) => p.characterId!);
    const characters = await this.characterRepo
      .createQueryBuilder("c")
      .select(["c.id", "c.userId"])
      .where("c.id IN (:...ids)", { ids: charIds })
      .getMany();
    const ownerMap = new Map<string, string>();
    for (const c of characters) {
      if (c.userId) ownerMap.set(c.id, c.userId);
    }

    await Promise.all(
      pcs.map(async (p) => {
        const ownerId = ownerMap.get(p.characterId!);
        if (!ownerId) {
          this.logger.warn(
            `[SNAPSHOT-OVERLAY] missing_owner participant=${p.id} ` +
              `character=${p.characterId} — PC ficará com hp=${p.currentHp}/${p.maxHp} ` +
              `(persisted entity values, provavelmente 0/0).`,
          );
          return;
        }
        try {
          const sheet = await this.sheetService.computeSheet(
            ownerId,
            p.characterId!,
          );


          if (p.transformationState) {
            const form = p.transformationState.form;
            overlay.set(p.id, {
              currentHp: form.currentHp,
              maxHp: form.maxHp,
              tempHp: sheet.tempHp ?? 0,
            });
          } else {
            overlay.set(p.id, {
              currentHp: sheet.currentHp,
              maxHp: sheet.maxHp,
              tempHp: sheet.tempHp ?? 0,
            });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[SNAPSHOT-OVERLAY] computeSheet_failed participant=${p.id} ` +
              `character=${p.characterId}: ${msg}`,
          );
        }
      }),
    );
    return overlay;
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
