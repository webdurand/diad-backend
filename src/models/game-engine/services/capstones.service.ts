import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterStateEntity } from "src/entities/character-state.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { PersistentAreaService } from "./persistent-area.service";
import type { GameEventData } from "../interfaces/result.type";
import type { EffectInstancePayload } from "../interfaces/combat.interfaces";


@Injectable()
export class CapstonesService {
  private readonly logger = new Logger(CapstonesService.name);

  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly stateRepo: Repository<CharacterStateEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly persistentArea: PersistentAreaService,
  ) {}

  async runStartOfCombat(
    participant: EncounterParticipantEntity,
    ownerUserId: string | undefined,
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    if (participant.type !== "pc" || !participant.characterId) {
      return { events };
    }


    const alreadyDone = (participant.effectInstances ?? []).some(
      (e) =>
        (e as unknown as { kind?: string }).kind ===
        "capstone_start_combat_done",
    );
    if (alreadyDone) return { events };

    let sheet;
    try {
      sheet = await this.sheetService.computeSheet(
        ownerUserId ?? "",
        participant.characterId,
      );
    } catch {
      return { events };
    }

    const s = sheet as unknown as {
      hasPerfectSelf?: boolean;
      hasArcaneApotheosis?: boolean;
      hasSuperiorInspiration?: boolean;
      hasBardicInspiration?: boolean;
      classes?: Array<{ slug?: string; level?: number }>;
    };


    const stEntity = await this.stateRepo.findOne({
      where: { character_id: participant.characterId },
    });
    if (!stEntity) return { events };
    const st = stEntity as unknown as Record<string, unknown>;
    let stateDirty = false;


    if (s.hasPerfectSelf) {
      const fpNow =
        typeof st.focus_points_used === "number" ? st.focus_points_used : 0;
      if (fpNow > 0) {
        const newUsed = Math.max(0, fpNow - 4);
        st.focus_points_used = newUsed;
        stateDirty = true;
        events.push({
          event_type: "capstone_perfect_self_triggered",
          actor_participant_id: participant.id,
          data: {
            featureSlug: "perfect-self",
            fpRegained: fpNow - newUsed,
            usedBefore: fpNow,
            usedAfter: newUsed,
          },
        });
      }
    }


    if (s.hasArcaneApotheosis) {
      const spUsed =
        typeof st.sorcery_points_used === "number" ? st.sorcery_points_used : 0;
      if (spUsed > 0) {
        const newUsed = Math.max(0, spUsed - 4);
        st.sorcery_points_used = newUsed;
        stateDirty = true;
        events.push({
          event_type: "capstone_arcane_apotheosis_triggered",
          actor_participant_id: participant.id,
          data: {
            featureSlug: "arcane-apotheosis",
            spRegained: spUsed - newUsed,
            usedBefore: spUsed,
            usedAfter: newUsed,
          },
        });
      } else {
        events.push({
          event_type: "capstone_arcane_apotheosis_triggered",
          actor_participant_id: participant.id,
          data: {
            featureSlug: "arcane-apotheosis",
            spRegained: 0,
            usedBefore: 0,
            usedAfter: 0,
            note: "already_at_max",
          },
        });
      }
    }


    if (s.hasSuperiorInspiration) {
      const biUsed =
        typeof st.bardic_inspiration_uses_used === "number"
          ? st.bardic_inspiration_uses_used
          : 0;
      if (biUsed > 0) {
        const newUsed = Math.max(0, biUsed - 1);
        st.bardic_inspiration_uses_used = newUsed;
        stateDirty = true;
        events.push({
          event_type: "capstone_superior_inspiration_triggered",
          actor_participant_id: participant.id,
          data: {
            featureSlug: "superior-inspiration",
            usesRegained: biUsed - newUsed,
            usedBefore: biUsed,
            usedAfter: newUsed,
          },
        });
      }
    }

    if (stateDirty) {
      await this.stateRepo.save(stEntity);
    }


    participant.effectInstances = [
      ...(participant.effectInstances ?? []),
      {
        id: randomUUID(),
        kind: "capstone_start_combat_done",
        sourceFeatureSlug: "capstones",
        sourceCasterParticipantId: participant.id,
        payload: {} as unknown as EffectInstancePayload,
        expiresAt: { kind: "end_of_encounter" },
        requiresConcentration: false,
        appliedAt: new Date().toISOString(),
      } as unknown as (typeof participant.effectInstances)[number],
    ];
    await this.participants.save(participant);

    return { events };
  }


  async eldritchMaster(
    participant: EncounterParticipantEntity,
    ownerUserId: string,
  ): Promise<{
    ok: boolean;
    code?: string;
    events: GameEventData[];
    regained?: number;
  }> {
    if (participant.type !== "pc" || !participant.characterId) {
      return { ok: false, code: "INVALID_PARTICIPANT", events: [] };
    }
    const alreadyUsed = (participant.effectInstances ?? []).some(
      (e) =>
        (e as unknown as { kind?: string }).kind ===
        "eldritch_master_used_this_rest",
    );
    if (alreadyUsed) {
      return { ok: false, code: "ALREADY_USED_THIS_REST", events: [] };
    }

    const sheet = await this.sheetService.computeSheet(
      ownerUserId,
      participant.characterId,
    );
    const hasEldritchMaster =
      (sheet as { hasEldritchMaster?: boolean }).hasEldritchMaster === true;
    if (!hasEldritchMaster) {
      return { ok: false, code: "FEATURE_NOT_AVAILABLE", events: [] };
    }

    const stEntity = await this.stateRepo.findOne({
      where: { character_id: participant.characterId },
    });
    if (!stEntity) {
      return { ok: false, code: "STATE_NOT_FOUND", events: [] };
    }
    const st = stEntity as unknown as { pact_slots_used?: number };
    const slotsUsed =
      typeof st.pact_slots_used === "number" ? st.pact_slots_used : 0;
    const regained = slotsUsed;
    if (regained > 0) {
      st.pact_slots_used = 0;
      await this.stateRepo.save(stEntity);
    }


    participant.effectInstances = [
      ...(participant.effectInstances ?? []),
      {
        id: randomUUID(),
        kind: "eldritch_master_used_this_rest",
        sourceFeatureSlug: "eldritch-master",
        sourceCasterParticipantId: participant.id,
        payload: {} as unknown as EffectInstancePayload,
        expiresAt: { kind: "end_of_encounter" },
        requiresConcentration: false,
        appliedAt: new Date().toISOString(),
      } as unknown as (typeof participant.effectInstances)[number],
    ];
    await this.participants.save(participant);

    const events: GameEventData[] = [
      {
        event_type: "capstone_eldritch_master_triggered",
        actor_participant_id: participant.id,
        data: { featureSlug: "eldritch-master", slotsRegained: regained },
      },
    ];

    return { ok: true, events, regained };
  }


  async strokeOfLuckArm(
    participant: EncounterParticipantEntity,
    ownerUserId: string,
    kind: "attack" | "check",
  ): Promise<{ ok: boolean; code?: string; events: GameEventData[] }> {
    if (participant.type !== "pc" || !participant.characterId) {
      return { ok: false, code: "INVALID_PARTICIPANT", events: [] };
    }
    const alreadyUsed = (participant.effectInstances ?? []).some(
      (e) =>
        (e as unknown as { kind?: string }).kind ===
        "stroke_of_luck_used_this_rest",
    );
    if (alreadyUsed) {
      return { ok: false, code: "ALREADY_USED_THIS_REST", events: [] };
    }
    const sheet = await this.sheetService.computeSheet(
      ownerUserId,
      participant.characterId,
    );
    const hasStrokeOfLuck =
      (sheet as { hasStrokeOfLuck?: boolean }).hasStrokeOfLuck === true;
    if (!hasStrokeOfLuck) {
      return { ok: false, code: "FEATURE_NOT_AVAILABLE", events: [] };
    }

    const armedKind =
      kind === "attack"
        ? "stroke_of_luck_armed_attack"
        : "stroke_of_luck_armed_check";
    participant.effectInstances = [
      ...(participant.effectInstances ?? []),
      {
        id: randomUUID(),
        kind: armedKind as unknown as "stroke_of_luck_armed_attack",
        sourceFeatureSlug: "stroke-of-luck",
        sourceCasterParticipantId: participant.id,
        payload: {} as unknown as EffectInstancePayload,
        expiresAt: { kind: "until_consumed" },
        requiresConcentration: false,
        appliedAt: new Date().toISOString(),
      } as unknown as (typeof participant.effectInstances)[number],
      {
        id: randomUUID(),
        kind: "stroke_of_luck_used_this_rest" as unknown as "stroke_of_luck_armed_attack",
        sourceFeatureSlug: "stroke-of-luck",
        sourceCasterParticipantId: participant.id,
        payload: {} as unknown as EffectInstancePayload,
        expiresAt: { kind: "end_of_encounter" },
        requiresConcentration: false,
        appliedAt: new Date().toISOString(),
      } as unknown as (typeof participant.effectInstances)[number],
    ];
    await this.participants.save(participant);

    return {
      ok: true,
      events: [
        {
          event_type: "capstone_stroke_of_luck_armed",
          actor_participant_id: participant.id,
          data: { featureSlug: "stroke-of-luck", kind },
        },
      ],
    };
  }


  async holyNimbusCast(
    participant: EncounterParticipantEntity,
    ownerUserId: string,
  ): Promise<{ ok: boolean; code?: string; events: GameEventData[] }> {
    if (participant.type !== "pc" || !participant.characterId) {
      return { ok: false, code: "INVALID_PARTICIPANT", events: [] };
    }
    const sheet = await this.sheetService.computeSheet(
      ownerUserId,
      participant.characterId,
    );
    const hasHolyNimbus =
      (sheet as { hasHolyNimbus?: boolean }).hasHolyNimbus === true;
    if (!hasHolyNimbus) {
      return { ok: false, code: "FEATURE_NOT_AVAILABLE", events: [] };
    }
    if (participant.positionX == null || participant.positionY == null) {
      return { ok: false, code: "NO_POSITION", events: [] };
    }


    const classes =
      (
        sheet as unknown as {
          classes?: Array<{ slug?: string; spellSaveDc?: number }>;
        }
      ).classes ?? [];
    const paladinClass = classes.find(
      (c) => c.slug === "paladin" || c.spellSaveDc != null,
    );
    const dc = paladinClass?.spellSaveDc ?? 15;

    const area = await this.persistentArea.create({
      encounterId: participant.encounterId,
      casterParticipantId: participant.id,
      sourceSpell: "holy-nimbus",
      shapeKind: "sphere",
      originCell: { x: participant.positionX, y: participant.positionY },
      radiusCells: 6,
      damageDice: "10",
      damageType: "radiant",
      saveAbility: "con",
      saveDc: dc,
      halfOnSave: false,
      durationRoundsRemaining: 100,
      sourceConcentration: false,
    });


    participant.effectInstances = [
      ...(participant.effectInstances ?? []),
      {
        id: randomUUID(),
        kind: "holy_nimbus_armed",
        sourceFeatureSlug: "holy-nimbus",
        sourceCasterParticipantId: participant.id,
        payload: {} as unknown as EffectInstancePayload,
        expiresAt: { kind: "rounds", value: 100 },
        requiresConcentration: false,
        appliedAt: new Date().toISOString(),
      } as unknown as (typeof participant.effectInstances)[number],
    ];
    await this.participants.save(participant);

    return {
      ok: true,
      events: [
        {
          event_type: "capstone_holy_nimbus_armed",
          actor_participant_id: participant.id,
          data: {
            featureSlug: "holy-nimbus",
            radiusFt: 30,
            damage: 10,
            damageType: "radiant",
            saveDc: dc,
            areaId: area.id,
            durationRounds: 100,
          },
        },
      ],
    };
  }
}
