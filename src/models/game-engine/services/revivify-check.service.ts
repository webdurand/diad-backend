/**
 * Spec 020 — Revivify Check (PHB 5e p.272 — RAW puro, stateless).
 *
 * NÃO executa o cast. Apenas valida pré-requisitos para a magia ser elegível:
 *   1. Alvo tem dyingState='dead' (e o caster declarou esse character_id)
 *   2. Tempo desde a morte ≤ 1 minuto (60s) — janela rígida RAW
 *   3. Diamante de 300+gp declarado como componente material
 *   4. Corpo intacto (não-RAW: campo `body_destroyed` na character state)
 *
 * Emite NarrativeEvent.revivify_eligibility_checked (audience: Narrator,
 * CompanionAI, Director — info para arc-beat de fuga, drama, etc.).
 *
 * Nota RAW: spell em si tem casting time 1 action, range Touch — esses
 * detalhes ficam com cast_spell normal. Aqui só checamos eligibility.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CharacterEntity } from "src/entities/character.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

export interface RevivifyCheckInput {
  characterId: string;
  timeSinceDeathMin: number;
  hasDiamond300gp?: boolean;
  casterCharacterId?: string | null;
  campaignId?: string;
  /** Caller-declared dying state (override). Default: lookup latest participant. */
  targetDyingState?: "none" | "dying" | "stable" | "dead" | "captured";
  bodyDestroyed?: boolean;
  traceId?: string;
}

export interface RevivifyCheckResult {
  eligible: boolean;
  missingRequirements: string[];
  windowRemainingSec: number;
  casterKnowsSpell: boolean | null;
  narrativeDescriptor: string;
}

const REVIVIFY_WINDOW_MIN = 1; // RAW PHB

@Injectable()
export class RevivifyCheckService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly charRepo: Repository<CharacterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly partRepo: Repository<EncounterParticipantEntity>,
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
  ) {}

  async check(input: RevivifyCheckInput): Promise<RevivifyCheckResult> {
    const character = await this.charRepo.findOne({
      where: { id: input.characterId },
    });
    if (!character) {
      throw new DomainException(
        ErrorCode.CHARACTER_NOT_FOUND,
        `Character ${input.characterId} não encontrado.`,
      );
    }

    // 1. dyingState='dead': caller pode passar `targetDyingState`; senão
    // tentamos lookup via participant mais recente do PC.
    let dyingState = input.targetDyingState;
    if (!dyingState) {
      const part = await this.partRepo.findOne({
        where: { characterId: input.characterId },
      });
      dyingState = (part?.dyingState as typeof dyingState) ?? "none";
    }

    if (dyingState !== "dead") {
      throw new DomainException(
        ErrorCode.REVIVIFY_TARGET_NOT_DEAD,
        `Personagem '${character.name}' tem dyingState='${dyingState}', não 'dead'.`,
        {
          context: {
            characterId: input.characterId,
            currentDyingState: dyingState,
          },
        },
      );
    }

    const missing: string[] = [];

    // 2. window
    if (input.timeSinceDeathMin < 0) {
      missing.push("invalid_time_input");
    }
    if (input.timeSinceDeathMin > REVIVIFY_WINDOW_MIN) {
      missing.push("time_window_exceeded");
    }
    const windowRemainingSec = Math.max(
      0,
      Math.floor((REVIVIFY_WINDOW_MIN - input.timeSinceDeathMin) * 60),
    );

    // 3. diamond
    if (input.hasDiamond300gp !== true) {
      missing.push("missing_diamond_300gp");
    }

    // 4. body intact — caller declara via bodyDestroyed=true
    if (input.bodyDestroyed === true) {
      throw new DomainException(
        ErrorCode.REVIVIFY_BODY_DESTROYED,
        `Corpo de '${character.name}' foi destruído. Necessário Resurrection.`,
        { context: { characterId: input.characterId } },
      );
    }

    // 5. caster knows spell — V1 não valida (cast_spell endpoint já checa
    // spell_known/prepared). Retornamos null pra indicar "não validado aqui".
    const casterKnowsSpell: boolean | null = null;

    const eligible = missing.length === 0;
    const descriptor = eligible
      ? `${windowRemainingSec}s restantes — Revivify aplicável.`
      : `Revivify bloqueado: ${missing.join(", ")}.`;

    if (input.campaignId) {
      try {
        const envelope = this.factory.build({
          eventCategory: "NarrativeEvent",
          eventType: "revivify_eligibility_checked",
          source: {
            service: "diad-backend",
            module: "RevivifyCheckService.check",
            traceId: input.traceId,
          },
          scope: { campaignId: input.campaignId },
          payload: {
            characterId: input.characterId,
            eligible,
            missingRequirements: missing,
            windowRemainingSec,
            casterCharacterId: input.casterCharacterId ?? null,
          },
          narrativeDescriptor: descriptor,
        });
        await this.eventBus.publish(envelope);
      } catch {
        /* best-effort */
      }
    }

    return {
      eligible,
      missingRequirements: missing,
      windowRemainingSec,
      casterKnowsSpell,
      narrativeDescriptor: descriptor,
    };
  }
}
