import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CombatService } from "./combat.service";
import {
  canTakeReactionFromConditions,
} from "./condition-effects.service";
import {
  failure,
  GameErrorCode,
  GameResult,
  success,
} from "../interfaces/result.type";
import type { ReadyTrigger } from "../interfaces/combat.interfaces";

export interface ResolveReadyActionInput {
  encounterId: string;
  reactorParticipantId: string;
  targetParticipantId: string;
  ownerUserId: string;
  expectedTriggerKind?: ReadyTrigger["kind"];
}

export interface ReadyActionResolution {
  reactorParticipantId: string;
  targetParticipantId: string;
  actionName: string;
  reactionConsumed: boolean;
  attack: unknown;
}

@Injectable()
export class ReadyActionService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    @Inject(forwardRef(() => CombatService))
    private readonly combat: CombatService,
  ) {}

  async resolve(
    input: ResolveReadyActionInput,
  ): Promise<GameResult<ReadyActionResolution>> {
    const [reactor, target] = await Promise.all([
      this.participants.findOne({
        where: { id: input.reactorParticipantId },
      }),
      this.participants.findOne({
        where: { id: input.targetParticipantId },
      }),
    ]);
    if (!reactor || !target) {
      return failure(
        "Participante da Ação Preparada não encontrado.",
        GameErrorCode.PARTICIPANT_NOT_FOUND,
      );
    }
    if (
      reactor.encounterId !== input.encounterId ||
      target.encounterId !== input.encounterId ||
      reactor.faction === target.faction
    ) {
      return failure("Alvo inválido.", GameErrorCode.INVALID_TARGET);
    }
    if ((reactor.reactionsUsed ?? 0) > 0) {
      return failure(
        "Reação já utilizada neste round.",
        GameErrorCode.NO_REACTION_AVAILABLE,
      );
    }
    if (!canTakeReactionFromConditions(reactor.conditions)) {
      return failure(
        "Uma condição impede esta reação.",
        GameErrorCode.CONDITION_PREVENTS_ACTION,
      );
    }

    const prepared = reactor.readiedAction;
    const expectedTriggerKind =
      input.expectedTriggerKind ?? "enemy_enters_range";
    if (
      !prepared ||
      prepared.trigger.kind !== expectedTriggerKind ||
      prepared.actionDescriptor.kind !== "attack"
    ) {
      return failure(
        "Não há uma Ação Preparada válida para este gatilho.",
        GameErrorCode.INVALID_READY_TRIGGER,
      );
    }
    if (prepared.trigger.kind === "enemy_enters_range") {
      if (
        reactor.positionX == null ||
        reactor.positionY == null ||
        target.positionX == null ||
        target.positionY == null
      ) {
        return failure("Alvo inválido.", GameErrorCode.INVALID_TARGET);
      }
      const distanceFt =
        Math.max(
          Math.abs(target.positionX - reactor.positionX),
          Math.abs(target.positionY - reactor.positionY),
        ) * 5;
      if (distanceFt > prepared.trigger.rangeFt) {
        return failure("Alvo fora de alcance.", GameErrorCode.OUT_OF_RANGE);
      }
    }

    const actionName = prepared.actionDescriptor.actionName;
    const attack = await this.combat.resolveAttack(input.encounterId, {
      attackerParticipantId: reactor.id,
      targetParticipantId: target.id,
      actionName,
      ownerUserId: input.ownerUserId,
      _isSubAttack: true,
    });
    if (!attack.ok) return attack;

    const freshReactor = await this.participants.findOne({
      where: { id: reactor.id },
    });
    if (freshReactor) {
      freshReactor.reactionsUsed = (freshReactor.reactionsUsed ?? 0) + 1;
      freshReactor.readiedAction = null;
      await this.participants.save(freshReactor);
    }

    const events = [
      {
        event_type: "ready_action_resolved",
        actor_participant_id: reactor.id,
        target_participant_id: target.id,
        data: {
          actionName,
          triggerKind: prepared.trigger.kind,
          reactionConsumed: true,
          hit: attack.value.attackRoll.hit,
          critical: attack.value.attackRoll.critical,
          damageDealt: attack.value.damageRoll?.finalDamage ?? 0,
          targetHpAfter: attack.value.targetHpAfter ?? null,
        },
      },
    ];
    return success(
      {
        reactorParticipantId: reactor.id,
        targetParticipantId: target.id,
        actionName,
        reactionConsumed: true,
        attack: attack.value,
      },
      events,
    );
  }
}
