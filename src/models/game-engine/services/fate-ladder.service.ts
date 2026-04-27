import { randomUUID } from "crypto";

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CharacterEntity,
  CharacterStateEntity,
  CampaignEntity,
} from "src/entities";
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

/**
 * Spec 016 M0 — Fate Ladder service stub.
 *
 * Trigger ao 3º death save fail OU massive damage 2024 (remaining ≥ HP max).
 * Apresenta 4 opções narrativas (em hardcore mode, apenas A):
 *   A) Aceitar morte — epilogue forçado
 *   B) Sacrifício heroico — great feat narrativo
 *   C) Pagar o preço — sobrevive perdendo algo permanente
 *   D) Ressurreição RAW — só se world state confirma diamante+caster
 *
 * Fabula Ultima (Heroic Sacrifice) + Ironsworn (Pay the Price) + RAW
 * 2024 Resurrection. RAW preservado em death saves; Fate Ladder é
 * layer narrativa opt-in (categoria já aceita: morale system não-RAW).
 *
 * Ver `specs/016-play-shell-foundation/spec.md` §5 + contract `fate-ladder.json`.
 *
 * STUB M0 — métodos retornam `failure('not_implemented')`. M3 wira lógica.
 */
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
  // Option B requires player input (sacrifice description)
  sacrificeDescription?: string;
}

@Injectable()
export class FateLadderService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly stateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
  ) {}

  /**
   * Triggered ao 3º death save fail ou massive damage.
   *
   * M3 implementação: helpers puros wireados. Carrega campaign.death_handling,
   * resolve options disponíveis. Ritual-of-death message é template default;
   * voice-aware rendering pelo Narrator (M4 enrichment).
   */
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

    // Em hardcore, apenas opção A.
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

  /**
   * Resolve a opção escolhida. Retorna stateChanges descritivos
   * (Archivist consome via Coordinator hook).
   */
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

  /**
   * Probe: can option D ("Ressurreição") be offered?
   * Requires ≥1 caster with appropriate spell + diamante in inventory + time window.
   *
   * M3 simplified: caller provides casterHasSpell + diamondsAvailableGp.
   * Full DB scan (party iteration, inventory items) ficará em M4.
   */
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
    // Prefer cheapest spell.
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
}
