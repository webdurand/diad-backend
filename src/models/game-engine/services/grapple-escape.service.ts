import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { DiceService } from "./dice.service";
import {
  failure,
  GameErrorCode,
  GameEventData,
  GameResult,
  success,
} from "../interfaces/result.type";
import { ConditionLifecycleService } from "./condition-lifecycle.service";

const INCAPACITATING_SLUGS = new Set([
  "incapacitated",
  "paralyzed",
  "petrified",
  "stunned",
  "unconscious",
]);

export interface GrappleEscapeResult {
  participantId: string;
  grapplerId: string;
  ability: "athletics" | "acrobatics";
  rolls: {
    target: { d20: number; modifier: number; total: number };
    grappler: { d20: number; modifier: number; total: number };
  };
  outcome: "escaped" | "failed";
  actionConsumed: boolean;
}


@Injectable()
export class GrappleEscapeService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    private readonly dice: DiceService,
    private readonly conditions: ConditionLifecycleService,
  ) {}

  async attemptEscape(
    target: EncounterParticipantEntity,
    ability: "athletics" | "acrobatics",
    targetModifier: number,
    grapplerModifier: number,
  ): Promise<GameResult<GrappleEscapeResult>> {
    if (!target.grappledByParticipantId) {
      return failure(GameErrorCode.NOT_GRAPPLED);
    }
    const grappler = await this.participants.findOne({
      where: { id: target.grappledByParticipantId },
    });
    if (!grappler) return failure(GameErrorCode.PARTICIPANT_NOT_FOUND);

    if (target.actionUsed) {
      return failure(GameErrorCode.NO_ACTION_AVAILABLE);
    }

    const tD20 = this.dice.roll(20);
    const gD20 = this.dice.roll(20);
    const tTotal = tD20 + targetModifier;
    const gTotal = gD20 + grapplerModifier;
    const escaped = tTotal > gTotal;

    target.actionUsed = true;
    const events: GameEventData[] = [];

    if (escaped) {

      const grappledInst = (target.conditionInstances ?? []).find(
        (ci) => ci.slug === "grappled" && ci.appliedBy === grappler.id,
      );
      if (grappledInst) {
        const r = await this.conditions.removeConditionInstance(
          target,
          grappledInst.id,
          "grapple_escape",
        );
        events.push(...r.events);
      } else {

        target.conditions = (target.conditions ?? []).filter(
          (s) => s !== "grappled",
        );
        target.grappledByParticipantId = null;
      }
      events.push({
        event_type: "grapple_escape_success",
        actor_participant_id: target.id,
        target_participant_id: grappler.id,
        data: { ability, tTotal, gTotal },
      });
    } else {
      events.push({
        event_type: "grapple_escape_failed",
        actor_participant_id: target.id,
        target_participant_id: grappler.id,
        data: { ability, tTotal, gTotal },
      });
    }
    await this.participants.save(target);

    return {
      ...success({
        participantId: target.id,
        grapplerId: grappler.id,
        ability,
        rolls: {
          target: { d20: tD20, modifier: targetModifier, total: tTotal },
          grappler: { d20: gD20, modifier: grapplerModifier, total: gTotal },
        },
        outcome: escaped ? "escaped" : "failed",
        actionConsumed: true,
      }),
      events,
    };
  }


  async releaseAllGrappledBy(
    grapplerId: string,
    encounterId: string,
  ): Promise<{ events: GameEventData[] }> {
    const victims = await this.participants.find({
      where: { encounterId, grappledByParticipantId: grapplerId },
    });
    const events: GameEventData[] = [];
    for (const v of victims) {
      const inst = (v.conditionInstances ?? []).find(
        (ci) => ci.slug === "grappled" && ci.appliedBy === grapplerId,
      );
      if (inst) {
        const r = await this.conditions.removeConditionInstance(
          v,
          inst.id,
          "grapple_auto_release",
        );
        events.push(...r.events);
      } else {
        v.conditions = (v.conditions ?? []).filter((s) => s !== "grappled");
        v.grappledByParticipantId = null;
        await this.participants.save(v);
      }
      events.push({
        event_type: "grapple_auto_release",
        actor_participant_id: grapplerId,
        target_participant_id: v.id,
        data: {},
      });
    }
    return { events };
  }


  isIncapacitatingForGrappler(slug: string): boolean {
    return INCAPACITATING_SLUGS.has(slug);
  }
}
