import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { DiceService } from "./dice.service";
import { ConcentrationService } from "./concentration.service";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { LegendaryActionService } from "./legendary-action.service";
import { PersistentAreaService } from "./persistent-area.service";
import { CapstonesService } from "./capstones.service";
import { TransformationService } from "./transformation.service";
import type { GameEventData } from "../interfaces/result.type";
import type { SaveAbility } from "../interfaces/combat.interfaces";
import { resetHasteAction } from "./haste-action";
import {
  getMonsterRechargeRange,
  monsterActionDisplayName,
  rechargeMinimum,
} from "./monster-recharge";
import { concentrationMatchesExpiredArea } from "./concentration-area-expiry";


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
    private readonly transformation: TransformationService,
  ) {}


  async run(
    participant: EncounterParticipantEntity,
    opts?: {
      isStartOfRound?: boolean;
      allParticipantsInRound?: EncounterParticipantEntity[];
      getSaveModifier?: (ability: SaveAbility) => Promise<{
        modifier: number;
        advantage: boolean;
        disadvantage: boolean;
      }>;
      getSaveModifierForTarget?: (
        ability: SaveAbility,
        target: EncounterParticipantEntity,
      ) => Promise<{
        modifier: number;
        advantage?: boolean;
        disadvantage?: boolean;
        autoFail?: boolean;
      }>;
      currentRound?: number;
      currentTurnIndex?: number;
      ownerUserId?: string;
    },
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];

    if (resetHasteAction(participant)) {
      await this.participants.save(participant);
      events.push({
        event_type: "haste_action_refreshed",
        actor_participant_id: participant.id,
        data: { sourceSpell: "haste" },
      });
    }



    const capRes = await this.capstones.runStartOfCombat(
      participant,
      opts?.ownerUserId,
    );
    events.push(...capRes.events);


    const r = await this.rollRecharges(participant);
    events.push(...r.events);


    const padTick = await this.persistentArea.resolveStartTurnIn(
      participant,
      opts?.getSaveModifier
        ? async (ability) => {
            const m = await opts.getSaveModifier!(ability);
            return {
              modifier: m.modifier,
              advantage: m.advantage,
              disadvantage: m.disadvantage,
            };
          }
        : undefined,
      opts?.currentRound != null && opts?.currentTurnIndex != null
        ? `${opts.currentRound}:${opts.currentTurnIndex}`
        : undefined,
    );
    events.push(...padTick.events);
    if (
      padTick.events.some(
        (event) =>
          event.event_type === "tile_effect_damage_applied" &&
          event.data?.effectKind === "guardian-of-faith",
      )
    ) {
      await this.participants.update(participant.id, {
        effectInstances: participant.effectInstances,
      });
    }

    if (opts?.currentRound != null) {
      const allParticipants =
        opts.allParticipantsInRound ??
        (await this.participants.find({
          where: { encounterId: participant.encounterId },
        }));
      const storm = await this.persistentArea.resolveStormOfVengeanceTurn(
        participant,
        opts.currentRound,
        allParticipants,
        opts.getSaveModifierForTarget,
      );
      events.push(...storm.events);
    }


    const conc = await this.concentration.decrementDurationFor(participant);
    events.push(...conc.events);




    const tRes = await this.transformation.tickDurationOnTurnStart(
      participant.id,
    );
    events.push(...tRes.events);


    if (participant.legendaryPointsMax != null) {
      const pool = await this.legendary.resetPool(participant);
      events.push(...pool.events);
    }


    if (opts?.isStartOfRound && opts.allParticipantsInRound?.length) {
      const decr = await this.conditions.decrementDurationsAtRoundStart(
        opts.allParticipantsInRound,
      );
      events.push(...decr.events);
      const padExpire = await this.persistentArea.decrementDurations(
        participant.encounterId,
      );
      events.push(...padExpire.events);
      const casterIds = Array.from(
        new Set(
          padExpire.expired
            .filter(
              (area) =>
                area.sourceConcentration && area.casterParticipantId != null,
            )
            .map((area) => area.casterParticipantId as string),
        ),
      );
      for (const casterId of casterIds) {
        const caster = await this.participants.findOne({
          where: { id: casterId },
        });
        if (!caster) continue;
        const matchingArea = padExpire.expired.find((area) =>
          concentrationMatchesExpiredArea(caster, area),
        );
        if (!matchingArea) continue;
        const concentrationExpired = await this.concentration.break(
          caster,
          "expired",
        );
        events.push(...concentrationExpired.events);
      }
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
      if (!action || typeof action !== "object") continue;
      const a = action as Record<string, unknown>;
      const recharge = getMonsterRechargeRange(a);
      if (!recharge) continue;
      const name = monsterActionDisplayName(a);
      if (!name) continue;
      if (state[name] === "used") {
        const roll = this.dice.roll(6);
        const recharged = roll >= rechargeMinimum(recharge);
        if (recharged) {
          state[name] = "available";
          changed = true;
          events.push({
            event_type: "recharge_rolled",
            actor_participant_id: participant.id,
            data: {
              actionName: name,
              rolled: roll,
              recharged: true,
              range: recharge,
            },
          });
        } else if (state[name] === "used") {
          events.push({
            event_type: "recharge_rolled",
            actor_participant_id: participant.id,
            data: {
              actionName: name,
              rolled: roll,
              recharged: false,
              range: recharge,
            },
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
    if (typeof raw === "object")
      return Object.values(raw as Record<string, unknown>);
    return null;
  }
}
