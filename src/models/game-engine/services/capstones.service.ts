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

/**
 * Spec 012 Lote C — Capstones L18-L20 (RAW 2024 XPHB).
 *
 * Agrega hooks de start-of-combat (primeiro turno de cada PC no encontro):
 *   - Monk L20 Perfect Self (Body and Mind): se inicia combat sem Focus Points,
 *     ganha 4 FP.
 *   - Sorcerer L20 Arcane Apotheosis: inicia combat com +4 Sorcery Points.
 *   - Bard L18 Superior Inspiration: inicia combat; se tem 0 Bardic Inspiration
 *     uses, recupera 1.
 *
 * Marker via effectInstance kind='capstone_start_combat_done' pra evitar aplicar
 * várias vezes no round 1. Removido naturalmente ao fim do encontro.
 */
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

    // Marker: effect persistente por encontro.
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

    // Monk L20 Perfect Self — reset FP para 4 se 0 (RAW: regain 4 FP at initiative roll if have none).
    const stEntity = await this.stateRepo.findOne({
      where: { character_id: participant.characterId },
    });
    if (!stEntity) return { events };
    const st = stEntity as unknown as Record<string, unknown>;
    let stateDirty = false;

    // Monk L20 Perfect Self — decrement focus_points_used até -4 se >0.
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

    // Sorcerer L20 Arcane Apotheosis — +4 SP ao iniciar combat.
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

    // Bard L18 Superior Inspiration — +1 BI use se está em 0.
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

    // Marca processado
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

  /**
   * Spec 012 Lote C — Warlock L20 Eldritch Master (RAW 2024 XPHB).
   * 1min meditação recupera todos os Pact Magic slots. 1/LR.
   * Rastreia via `eldritch_master_used_this_rest` effectInstance que expira
   * em long rest.
   */
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

    // Marca consumed até próximo long rest (rest.service limpa na LR)
    participant.effectInstances = [
      ...(participant.effectInstances ?? []),
      {
        id: randomUUID(),
        kind: "eldritch_master_used_this_rest",
        sourceFeatureSlug: "eldritch-master",
        sourceCasterParticipantId: participant.id,
        payload: {} as unknown as EffectInstancePayload,
        expiresAt: { kind: "end_of_encounter" }, // tambem limpa via rest handler
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

  /**
   * Spec 012 Lote D — Rogue L20 Stroke of Luck (RAW 2024 XPHB).
   * 1/SR arm: próximo attack roll que erra vira hit OU próximo ability check
   * é tratado como d20=20. Consumo automático via effectInstance.
   */
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

  /**
   * Spec 012 Lote D — Paladin L20 Devotion Holy Nimbus (RAW 2024 XPHB).
   * 1min aura 30ft. Inimigos no start de turn deles → save CON ou 10 radiant damage.
   * Player advantage em saves vs spells de undead/fiend. 1/LR.
   * Implementação: PersistentAreaEffect 30ft (6 cells) + flag `holy_nimbus_armed`
   * no caster. Duração 100 rounds (proxy 1min).
   */
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

    // Save DC = 8 + PB + CHA mod (Paladin spellcasting)
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
      radiusCells: 6, // 30ft
      damageDice: "10", // 10 radiant flat
      damageType: "radiant",
      saveAbility: "con",
      saveDc: dc,
      halfOnSave: false, // RAW: save avoids damage entirely
      durationRoundsRemaining: 100, // 1min
      sourceConcentration: false,
    });

    // Marker no caster (advantage em saves vs undead/fiend spells — V2 hook em save)
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
