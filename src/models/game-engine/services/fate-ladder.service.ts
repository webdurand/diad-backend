import { randomUUID } from "crypto";

import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CharacterEntity,
  CharacterStateEntity,
  CampaignEntity,
} from "src/entities";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { GameResult, failure, success } from "../interfaces/result.type";
import {
  buildPayPriceOutcome,
  DEFAULT_PRICE_TABLE,
  eligibleResurrectionSpells,
  pickRandomPrice,
  PriceCost,
  RESURRECTION_TABLE,
  ResurrectionSpell,
  validateSacrificeBounded,
} from "./fate-ladder-helpers";


export type FateLadderTrigger =
  | "three_failed_death_saves"
  | "massive_damage_2024"
  | "instant_kill_effect";

export type FateLadderOption = "A" | "B" | "C" | "D";

export type DeathHandlingMode = "narrative" | "hardcore";

export interface FateLadderState {
  ladderId: string;
  characterId: string;
  trigger: FateLadderTrigger;
  deathHandlingMode: DeathHandlingMode;
  ritualOfDeathMessage: string;
  availableOptions: FateLadderOption[];
}

export interface FateLadderResolution {
  characterId: string;
  ladderId: string;
  chosenOption: FateLadderOption;

  sacrificeDescription?: string;
}

@Injectable()
export class FateLadderService {
  private readonly logger = new Logger(FateLadderService.name);

  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly stateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
  ) {}


  async openLadder(
    characterId: string,
    trigger: FateLadderTrigger,
    options?: {
      casterPartyHasSpell?: ResurrectionSpell[];
      diamondsAvailableGp?: number;
      minutesSinceDeath?: number;
      campaignId?: string;
    },
  ): Promise<GameResult<FateLadderState>> {
    const character = await this.characterRepo.findOne({
      where: { id: characterId },
    });
    if (!character) {
      return failure("Personagem não encontrado.", "NOT_FOUND");
    }
    const campaign = options?.campaignId
      ? await this.campaignRepo.findOne({ where: { id: options.campaignId } })
      : null;
    const mode: DeathHandlingMode =
      (campaign as { deathHandling?: DeathHandlingMode } | null)
        ?.deathHandling ?? "narrative";


    const baseOptions: FateLadderOption[] =
      mode === "hardcore" ? ["A"] : ["A", "B", "C"];

    const eligibleSpells = eligibleResurrectionSpells({
      minutesSinceDeath: options?.minutesSinceDeath ?? 0,
      diamondsAvailableGp: options?.diamondsAvailableGp ?? 0,
    });
    const casterHas = options?.casterPartyHasSpell ?? [];
    const optionDAvailable = eligibleSpells.some((s) => casterHas.includes(s));
    if (mode === "narrative" && optionDAvailable) {
      baseOptions.push("D");
    }

    return success({
      ladderId: randomUUID(),
      characterId,
      trigger,
      deathHandlingMode: mode,
      ritualOfDeathMessage: this.defaultRitualMessage(
        character.name ?? "O herói",
      ),
      availableOptions: baseOptions,
    });
  }


  async resolveLadder(
    resolution: FateLadderResolution,
  ): Promise<GameResult<{ stateChanges: string[]; outcome?: unknown }>> {
    switch (resolution.chosenOption) {
      case "A":
        return success({
          stateChanges: [
            "arc_beat=CHANGE_forced",
            "trigger_epilogue_modal",
            "pc_status=dead_permanent",
          ],
        });
      case "B": {
        if (!resolution.sacrificeDescription) {
          return failure("Sacrifício requer descrição.", "INVALID_ACTION");
        }
        const validation = validateSacrificeBounded(
          resolution.sacrificeDescription,
        );
        if (!validation.ok) {
          return failure(
            `Sacrifício rejeitado: ${validation.reason}`,
            "INVALID_ACTION",
          );
        }
        return success({
          stateChanges: [
            "arc_beat=CHANGE_forced_via_sacrifice",
            "trigger_epilogue_modal_celebrate",
            "legacy_bond_for_next_pc=true",
            "bonus_inspiration_next_pc=1",
          ],
          outcome: { description: resolution.sacrificeDescription.trim() },
        });
      }
      case "C": {
        const cost = pickRandomPrice(DEFAULT_PRICE_TABLE);
        const outcome = buildPayPriceOutcome(cost);
        return success({
          stateChanges: [
            "pc_hp=1",
            "pc_status=stable_unconscious",
            "wakes_next_round",
            `cost_applied=${cost.kind}`,
          ],
          outcome,
        });
      }
      case "D":
        return success({
          stateChanges: [
            "pc_hp=1",
            "pc_status=alive",
            "consume_diamond_component",
          ],
        });
      default:
        return failure(
          `Opção ${resolution.chosenOption} desconhecida.`,
          "INVALID_ACTION",
        );
    }
  }


  async checkResurrectionAvailability(input: {
    minutesSinceDeath: number;
    diamondsAvailableGp: number;
    casterPartyHasSpell: ResurrectionSpell[];
  }): Promise<{
    available: boolean;
    spellAvailable?: ResurrectionSpell;
    diamondGp?: number;
  }> {
    const eligible = eligibleResurrectionSpells({
      minutesSinceDeath: input.minutesSinceDeath,
      diamondsAvailableGp: input.diamondsAvailableGp,
    });
    const usable = eligible.filter((s) =>
      input.casterPartyHasSpell.includes(s),
    );
    if (usable.length === 0) {
      return { available: false };
    }

    const cheapest = usable.sort(
      (a, b) =>
        RESURRECTION_TABLE[a].diamondGp - RESURRECTION_TABLE[b].diamondGp,
    )[0];
    return {
      available: true,
      spellAvailable: cheapest,
      diamondGp: RESURRECTION_TABLE[cheapest].diamondGp,
    };
  }

  private defaultRitualMessage(name: string): string {
    return `E assim, ${name}, a luz dos céus se apaga lentamente. O destino aguarda sua escolha.`;
  }


  async applyResolution(
    characterId: string,
    stateChanges: string[],
  ): Promise<{
    appliedChanges: Array<{
      change: string;
      applied: boolean;
      reason?: string;
    }>;
    pcFinalState: {
      current_hp: number;
      max_hp_bonus: number;
      conditions: string[];
      dyingState?: string | null;
    };
  }> {
    const applied: Array<{
      change: string;
      applied: boolean;
      reason?: string;
    }> = [];

    const state = await this.stateRepo.findOne({
      where: { character_id: characterId },
    });
    if (!state) {
      throw new Error(`character_state não encontrado para ${characterId}`);
    }

    let dirty = false;
    for (const change of stateChanges) {
      if (change === "pc_hp=1") {
        state.current_hp = 1;
        dirty = true;
        applied.push({ change, applied: true });
        continue;
      }
      if (change === "pc_status=stable_unconscious") {
        const next = new Set(state.conditions ?? []);
        next.add("unconscious");
        next.delete("dying");
        next.delete("dead");
        state.conditions = Array.from(next);
        dirty = true;
        applied.push({ change, applied: true });
        continue;
      }
      if (change === "pc_status=alive") {
        const next = new Set(state.conditions ?? []);
        next.delete("unconscious");
        next.delete("dying");
        next.delete("dead");
        state.conditions = Array.from(next);
        dirty = true;
        applied.push({ change, applied: true });
        continue;
      }
      if (change === "pc_status=dead_permanent") {
        state.conditions = ["dead"];
        dirty = true;
        applied.push({ change, applied: true });
        continue;
      }
      if (change === "consume_diamond_component") {



        this.logger.warn(
          `consume_diamond_component não aplicado em ${characterId} (V1 — TODO).`,
        );
        applied.push({
          change,
          applied: false,
          reason: "diamond consume V1 não implementado",
        });
        continue;
      }




      // Spec 049: custos mecânicos do preço viram estado real, não só descritor.
      if (change === "cost_applied=exhaustion_plus_2_perm") {
        const before = state.exhaustion_level ?? 0;
        state.exhaustion_level = Math.min(6, before + 2);
        dirty = true;
        applied.push({
          change,
          applied: true,
          reason: `exhaustion ${before} -> ${state.exhaustion_level} (track 1-6)`,
        });
        continue;
      }

      applied.push({
        change,
        applied: false,
        reason: "descritor narrativo (consumo via Coordinator)",
      });
    }

    if (dirty) {
      await this.stateRepo.save(state);
    }




    let dyingState: string | null = null;
    try {
      const activeParticipant = await this.participantRepo
        .createQueryBuilder("p")
        .innerJoin("p.encounter", "e")
        .where("p.character_id = :cid", { cid: characterId })
        .andWhere("e.status = :st", { st: "active" })
        .orderBy("p.id", "DESC")
        .getOne();
      if (activeParticipant) {
        if (state.conditions?.includes("dead")) {
          activeParticipant.dyingState = "dead";
        } else if (state.conditions?.includes("unconscious")) {
          activeParticipant.dyingState = "stable";
        } else if (state.current_hp > 0) {
          activeParticipant.dyingState = "none";
        }
        dyingState = activeParticipant.dyingState;
        await this.participantRepo.save(activeParticipant);
      }
    } catch (err) {
      this.logger.warn(
        `falha ao sincronizar participant.dyingState para ${characterId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      appliedChanges: applied,
      pcFinalState: {
        current_hp: state.current_hp,
        max_hp_bonus: state.max_hp_bonus,
        conditions: state.conditions ?? [],
        dyingState,
      },
    };
  }
}
