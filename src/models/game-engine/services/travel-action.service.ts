import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  GameSessionEntity,
  SessionTravelState,
} from "src/entities/game-session.entity";
import { CharacterEquipmentEntity } from "src/entities/character-equipment.entity";
import { CharacterStateEntity } from "src/entities/character-state.entity";
import { CharacterClassEntity } from "src/entities/character-class.entity";
import { LocationConnectionEntity } from "src/entities/location-connection.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { SceneContextCacheService } from "src/models/session/services/scene-context-cache.service";
import { DiceService } from "./dice.service";
import {
  parseTravelTimeToMinutes,
} from "src/lib/parse-travel-time";
import { computeTravelTurns } from "src/lib/travel-turn-bucket";

export type TravelActionKind = "hasten" | "camp" | "scout" | "reroute";
export type TravelRestType = "short" | "long";
export type TravelEdition = "2014" | "2024";

export interface TravelActionInput {
  kind: TravelActionKind;
  restType?: TravelRestType;
  alternativeLocationId?: string;
  perceptionModifier?: number;
  hdToSpend?: Record<string, number>;
  edition?: TravelEdition;
}

export interface TravelActionConsequence {
  type:
    | "exhaustion"
    | "hd_consumed"
    | "rations_consumed"
    | "rest_applied"
    | "knowledge_revealed"
    | "turn_added"
    | "turn_removed";
  value: unknown;
}

export interface TravelActionResult {
  status: "applied";
  appliedAt: string;
  travelState: {
    destinationLocationId: string;
    destinationName: string;
    destinationBiome: string;
    elapsedTurns: number;
    totalTurns: number;
    progressPercent: number;
  };
  narrativeDescriptor: string;
  consequencesApplied: TravelActionConsequence[];
  outcome:
    | {
        kind: "hasten";
        hastenResult: "applied";
        newExhaustionLevel: number | null;
      }
    | {
        kind: "camp";
        campResult: "short_applied" | "long_applied";
        hdRecovered: number;
        newExhaustionLevel: number | null;
      }
    | {
        kind: "scout";
        scoutResult: "success" | "partial" | "fail" | "critical_fail";
        rollResult: number;
        cd: number;
        revealedEncounterType: string | null;
        narrativeBeat: string;
      }
    | {
        kind: "reroute";
        rerouteResult: "applied";
        newDestinationLocationId: string;
      };
}

const TRAVEL_ACTION_KINDS: ReadonlySet<string> = new Set([
  "hasten",
  "camp",
  "scout",
  "reroute",
]);

const SAFE_LONG_REST_BIOMES = new Set([
  "road",
  "urban",
  "settlement",
  "town",
  "village",
  "city",
  "safe",
]);

const SCOUT_DC_BY_BIOME: Record<string, number> = {
  urban: 10,
  settlement: 10,
  city: 10,
  road: 10,
  wilderness: 13,
  forest: 13,
  mountain: 15,
  mountains: 15,
  desert: 17,
  swamp: 17,
  planar: 20,
  supernatural: 20,
};

@Injectable()
export class TravelActionService {
  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly stateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CharacterEquipmentEntity)
    private readonly equipmentRepo: Repository<CharacterEquipmentEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly characterClassRepo: Repository<CharacterClassEntity>,
    @InjectRepository(LocationConnectionEntity)
    private readonly connectionRepo: Repository<LocationConnectionEntity>,
    private readonly contextCache: SceneContextCacheService,
    private readonly dice: DiceService,
    @Optional()
    private readonly eventBus?: EventBusService,
    @Optional()
    private readonly envelopeFactory?: EventEnvelopeFactory,
  ) {}

  async apply(
    sessionId: string,
    input: TravelActionInput,
  ): Promise<TravelActionResult> {
    if (!TRAVEL_ACTION_KINDS.has(input.kind)) {
      throw new DomainException(
        ErrorCode.TRAVEL_ACTION_INVALID_KIND,
        "Ação de viagem inválida.",
        { context: { sessionId, kind: input.kind } },
      );
    }

    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new DomainException(
        ErrorCode.SESSION_NOT_FOUND,
        `Sessão ${sessionId} não encontrada.`,
      );
    }
    if (session.config?.hubPoiEnabled !== true) {
      throw new DomainException(
        ErrorCode.TRAVEL_ACTION_DISABLED_BY_FLAG,
        "Ações de viagem dependem do hub POI habilitado.",
        { context: { sessionId } },
      );
    }

    const travel = session.travelState;
    if (!travel?.active) {
      throw new DomainException(
        ErrorCode.TRAVEL_ACTION_NO_ACTIVE_TRAVEL,
        "Não há viagem ativa para aplicar ação.",
        { context: { sessionId, kind: input.kind } },
      );
    }

    let result: TravelActionResult;
    if (input.kind === "hasten") {
      result = await this.hasten(session, travel);
    } else if (input.kind === "camp") {
      result = await this.camp(session, travel, input);
    } else if (input.kind === "scout") {
      result = await this.scout(session, travel, input);
    } else {
      result = await this.reroute(session, travel, input);
    }

    session.travelState = travel;
    await this.sessionRepo.save(session);
    this.contextCache.invalidateAll();
    await this.publishTravelAction(session.id, result);
    return result;
  }

  private async hasten(
    session: GameSessionEntity,
    travel: SessionTravelState,
  ): Promise<TravelActionResult> {
    const characterId = this.getLeadCharacterId(session);
    const state = await this.getLeadState(characterId);
    const currentExhaustion = state?.exhaustion_level ?? 0;
    if (!state || currentExhaustion >= 5) {
      throw new DomainException(
        ErrorCode.TRAVEL_ACTION_EXHAUSTION_CAP,
        "Acelerar foi bloqueado antes do passo de morte por exhaustion.",
        {
          context: {
            sessionId: session.id,
            characterId: characterId ?? undefined,
            exhaustionLevel: currentExhaustion,
          },
          hint:
            "DIAD pacing guard: exhaustion nível 6 é morte em ambas edições.",
        },
      );
    }

    const ration = await this.findRationItem(characterId);
    if (!ration) {
      throw new DomainException(
        ErrorCode.TRAVEL_ACTION_INSUFFICIENT_RATIONS,
        "Acelerar exige consumir 1 ração.",
        { context: { sessionId: session.id, characterId: characterId ?? undefined } },
      );
    }

    await this.consumeRation(ration);
    state.exhaustion_level = Math.min(6, currentExhaustion + 1);
    await this.stateRepo.save(state);
    this.removeTravelTurn(travel);

    return this.buildResult(travel, "Você acelera o passo, ração na boca.", [
      { type: "rations_consumed", value: 1 },
      {
        type: "exhaustion",
        value: {
          from: currentExhaustion,
          to: state.exhaustion_level,
          rawTrack: "1-6",
        },
      },
      { type: "turn_removed", value: 1 },
    ], {
      kind: "hasten",
      hastenResult: "applied",
      newExhaustionLevel: state.exhaustion_level,
    });
  }

  private async camp(
    session: GameSessionEntity,
    travel: SessionTravelState,
    input: TravelActionInput,
  ): Promise<TravelActionResult> {
    const restType = input.restType ?? "short";
    const characterId = this.getLeadCharacterId(session);
    const state = await this.getLeadState(characterId);
    let hdRecovered = 0;
    let newExhaustionLevel: number | null = state?.exhaustion_level ?? null;
    const consequences: TravelActionConsequence[] = [
      { type: "turn_added", value: 1 },
    ];

    if (restType === "long") {
      if (!this.canLongRestHere(travel.destinationBiome)) {
        throw new DomainException(
          ErrorCode.TRAVEL_ACTION_UNSAFE_LONG_REST,
          "Long rest inseguro nesta rota.",
          {
            context: {
              sessionId: session.id,
              destinationBiome: travel.destinationBiome,
            },
            hint:
              "DIAD pacing guard: procure área segura ou resolva a ameaça antes.",
          },
        );
      }
      if (state) {
        const before = state.exhaustion_level;
        state.exhaustion_level = Math.max(0, before - 1);
        newExhaustionLevel = state.exhaustion_level;
        hdRecovered = await this.recoverLongRestHitDice(
          state,
          characterId,
          this.resolveEdition(session, input),
        );
        state.spell_slots_used = {};
        state.feature_uses_used = {};
        state.last_long_rest_at = new Date();
        await this.stateRepo.save(state);
        consequences.push({
          type: "exhaustion",
          value: { from: before, to: state.exhaustion_level, rawTrack: "1-6" },
        });
      }
    } else if (state) {
      const hdSpent = await this.spendShortRestHitDice(
        state,
        characterId,
        input.hdToSpend ?? {},
      );
      state.last_short_rest_at = new Date();
      await this.stateRepo.save(state);
      if (Object.keys(hdSpent).length > 0) {
        consequences.push({ type: "hd_consumed", value: hdSpent });
      }
    }

    this.addTravelTurn(travel);
    consequences.push({
      type: "rest_applied",
      value: {
        restType,
        rawDuration: restType === "short" ? "1 hour" : "8 hours",
      },
    });

    return this.buildResult(
      travel,
      restType === "short"
        ? "Você faz uma pausa curta antes de seguir."
        : "Você acampa com cautela e recupera fôlego.",
      consequences,
      {
        kind: "camp",
        campResult: restType === "short" ? "short_applied" : "long_applied",
        hdRecovered,
        newExhaustionLevel,
      },
    );
  }

  private async scout(
    session: GameSessionEntity,
    travel: SessionTravelState,
    input: TravelActionInput,
  ): Promise<TravelActionResult> {
    const cd = this.scoutDcForBiome(travel.destinationBiome);
    const rollResult = this.dice.roll(20) + (input.perceptionModifier ?? 0);
    const scoutResult =
      rollResult >= cd + 5
        ? "success"
        : rollResult >= cd
          ? "partial"
          : rollResult <= 5
            ? "critical_fail"
            : "fail";
    const success = scoutResult === "success" || scoutResult === "partial";
    const narrativeBeat = success
      ? "Você nota sinais na rota antes que eles virem problema."
      : scoutResult === "critical_fail"
        ? "Você não percebe nada. Pior: algo parece perceber você."
        : "Você vigia a rota, mas não encontra uma pista confiável.";

    if (!success) {
      (travel as SessionTravelState & { encounterRollDeltaNextTurn?: number })
        .encounterRollDeltaNextTurn = 1;
    }

    return this.buildResult(travel, narrativeBeat, success ? [
      { type: "knowledge_revealed", value: "route_signs" },
    ] : [], {
      kind: "scout",
      scoutResult,
      rollResult,
      cd,
      revealedEncounterType: success ? "route_warning" : null,
      narrativeBeat,
    });
  }

  private async reroute(
    session: GameSessionEntity,
    travel: SessionTravelState,
    input: TravelActionInput,
  ): Promise<TravelActionResult> {
    if (!input.alternativeLocationId || !travel.fromLocationId) {
      throw new DomainException(
        ErrorCode.TRAVEL_ACTION_INVALID_REROUTE,
        "Reroute exige uma rota alternativa conhecida.",
        { context: { sessionId: session.id } },
      );
    }

    const connection = await this.connectionRepo.findOne({
      where: {
        fromLocationId: travel.fromLocationId,
        toLocationId: input.alternativeLocationId,
      },
      relations: ["toLocation"],
    });
    if (!connection || connection.isLocked || connection.isHidden) {
      throw new DomainException(
        ErrorCode.TRAVEL_ACTION_INVALID_REROUTE,
        "Rota alternativa inválida ou bloqueada.",
        {
          context: {
            sessionId: session.id,
            fromLocationId: travel.fromLocationId,
            alternativeLocationId: input.alternativeLocationId,
          },
        },
      );
    }

    travel.connectionId = connection.id;
    travel.toLocationId = connection.toLocationId;
    travel.toLocationName = connection.toLocation?.name ?? "Destino alternativo";
    travel.toLocationType = connection.toLocation?.type ?? travel.toLocationType;
    travel.destinationBiome =
      connection.toLocation?.type ?? travel.destinationBiome;

    const parsedMinutes = parseTravelTimeToMinutes(connection.travelTime ?? null);
    if (parsedMinutes && parsedMinutes > 0) {
      travel.totalMinutes = parsedMinutes;
      travel.totalTurns = Math.max(
        travel.elapsedTurns + 1,
        computeTravelTurns(parsedMinutes),
      );
    }
    this.addTravelTurn(travel);

    return this.buildResult(
      travel,
      `Você muda a rota para ${travel.toLocationName}.`,
      [{ type: "turn_added", value: 1 }],
      {
        kind: "reroute",
        rerouteResult: "applied",
        newDestinationLocationId: travel.toLocationId,
      },
    );
  }

  private getLeadCharacterId(session: GameSessionEntity): string | null {
    return Array.isArray(session.characterIds) && session.characterIds[0]
      ? session.characterIds[0]
      : null;
  }

  private async getLeadState(
    characterId: string | null,
  ): Promise<CharacterStateEntity | null> {
    if (!characterId) return null;
    return this.stateRepo.findOne({ where: { character_id: characterId } });
  }

  private async findRationItem(
    characterId: string | null,
  ): Promise<CharacterEquipmentEntity | null> {
    if (!characterId) return null;
    const items = await this.equipmentRepo.find({
      where: { character_id: characterId },
    });
    return (
      items.find((item) => {
        if (item.quantity <= 0) return false;
        const haystack = `${item.equipment?.slug ?? ""} ${item.equipment?.name ?? ""}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        return (
          haystack.includes("ration") ||
          haystack.includes("racao") ||
          haystack.includes("racoes")
        );
      }) ?? null
    );
  }

  private async consumeRation(item: CharacterEquipmentEntity): Promise<void> {
    item.quantity -= 1;
    if (item.quantity <= 0) {
      await this.equipmentRepo.remove(item);
      return;
    }
    await this.equipmentRepo.save(item);
  }

  private addTravelTurn(travel: SessionTravelState): void {
    travel.totalTurns += 1;
    travel.totalMinutes += travel.minutesPerTurn;
  }

  private removeTravelTurn(travel: SessionTravelState): void {
    travel.totalTurns = Math.max(travel.elapsedTurns + 1, travel.totalTurns - 1);
    travel.totalMinutes = Math.max(
      travel.elapsedMinutes + travel.minutesPerTurn,
      travel.totalTurns * travel.minutesPerTurn,
    );
  }

  private scoutDcForBiome(biome: string): number {
    return SCOUT_DC_BY_BIOME[biome.toLowerCase()] ?? 13;
  }

  private canLongRestHere(biome: string): boolean {
    return SAFE_LONG_REST_BIOMES.has(biome.toLowerCase());
  }

  private resolveEdition(
    session: GameSessionEntity,
    input: TravelActionInput,
  ): TravelEdition {
    if (input.edition === "2014" || input.edition === "2024") {
      return input.edition;
    }
    const config = session.config as Record<string, unknown>;
    const rawEdition = config.edition ?? config.rulesEdition ?? config.ruleset;
    return String(rawEdition).includes("2014") ? "2014" : "2024";
  }

  private async spendShortRestHitDice(
    state: CharacterStateEntity,
    characterId: string | null,
    hdToSpend: Record<string, number>,
  ): Promise<Record<string, number>> {
    if (!characterId) return {};
    const maxByDie = await this.getTotalHitDiceByDie(characterId);
    const spent: Record<string, number> = {};
    const used = { ...(state.hit_dice_used ?? {}) };
    for (const [die, requestedRaw] of Object.entries(hdToSpend)) {
      const requested = Math.max(0, Math.floor(requestedRaw));
      if (requested <= 0) continue;
      const max = maxByDie[die] ?? 0;
      const alreadyUsed = used[die] ?? 0;
      const available = Math.max(0, max - alreadyUsed);
      const toSpend = Math.min(requested, available);
      if (toSpend <= 0) continue;
      used[die] = alreadyUsed + toSpend;
      spent[die] = toSpend;
    }
    state.hit_dice_used = used;
    return spent;
  }

  private async recoverLongRestHitDice(
    state: CharacterStateEntity,
    characterId: string | null,
    edition: TravelEdition,
  ): Promise<number> {
    const used = { ...(state.hit_dice_used ?? {}) };
    if (edition === "2024") {
      const recovered = Object.values(used).reduce(
        (sum, value) => sum + Math.max(0, Number(value) || 0),
        0,
      );
      state.hit_dice_used = {};
      return recovered;
    }

    if (!characterId) return 0;
    const maxByDie = await this.getTotalHitDiceByDie(characterId);
    const totalHd = Object.values(maxByDie).reduce((sum, value) => sum + value, 0);
    let recoveryPool = totalHd > 0 ? Math.max(1, Math.floor(totalHd / 2)) : 0;
    let recovered = 0;
    for (const die of Object.keys(used).sort()) {
      if (recoveryPool <= 0) break;
      const currentUsed = Math.max(0, Number(used[die]) || 0);
      const toRecover = Math.min(currentUsed, recoveryPool);
      used[die] = currentUsed - toRecover;
      if (used[die] <= 0) delete used[die];
      recoveryPool -= toRecover;
      recovered += toRecover;
    }
    state.hit_dice_used = used;
    return recovered;
  }

  private async getTotalHitDiceByDie(
    characterId: string,
  ): Promise<Record<string, number>> {
    const classes = await this.characterClassRepo.find({
      where: { character_id: characterId },
    });
    const byDie: Record<string, number> = {};
    for (const row of classes) {
      const sides = row.class?.hit_die;
      if (!sides) continue;
      const die = `d${sides}`;
      byDie[die] = (byDie[die] ?? 0) + Math.max(0, row.class_level ?? 0);
    }
    return byDie;
  }

  private buildResult(
    travel: SessionTravelState,
    narrativeDescriptor: string,
    consequencesApplied: TravelActionConsequence[],
    outcome: TravelActionResult["outcome"],
  ): TravelActionResult {
    return {
      status: "applied",
      appliedAt: new Date().toISOString(),
      travelState: {
        destinationLocationId: travel.toLocationId,
        destinationName: travel.toLocationName,
        destinationBiome: travel.destinationBiome,
        elapsedTurns: travel.elapsedTurns,
        totalTurns: travel.totalTurns,
        progressPercent: Math.min(
          100,
          Math.round((travel.elapsedTurns / travel.totalTurns) * 100),
        ),
      },
      narrativeDescriptor,
      consequencesApplied,
      outcome,
    };
  }

  private readonly logger = new Logger(TravelActionService.name);

  private async publishTravelAction(
    sessionId: string,
    result: TravelActionResult,
  ): Promise<void> {
    if (!this.eventBus || !this.envelopeFactory) return;
    try {
      const envelope = this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "travel_action_applied",
        source: {
          service: "diad-backend",
          module: "TravelActionService.apply",
        },
        scope: {
          campaignId: "",
          sessionId,
        },
        audiences: ["Narrator", "Director", "Archivist", "HUD"],
        narrativeDescriptor: result.narrativeDescriptor,
        payload: { ...result },
      });
      await this.eventBus.publish(envelope);
    } catch (err) {
      this.logger.warn("travel_action_applied.publish_failed", {
        "session.id": sessionId,
        "action.kind": result.outcome.kind,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
