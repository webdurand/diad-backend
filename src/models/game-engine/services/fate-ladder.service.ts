import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CharacterEntity,
  CharacterStateEntity,
  CampaignEntity,
} from 'src/entities';
import {
  GameResult,
  failure,
} from '../interfaces/result.type';

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
  | 'three_failed_death_saves'
  | 'massive_damage_2024'
  | 'instant_kill_effect';

export type FateLadderOption = 'A' | 'B' | 'C' | 'D';

export type DeathHandlingMode = 'narrative' | 'hardcore';

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
   * Director monta state com ritual-of-death message (voice-aware).
   */
  async openLadder(
    _characterId: string,
    _trigger: FateLadderTrigger,
  ): Promise<GameResult<FateLadderState>> {
    // TODO M3: lookup campaign.death_handling; render ritual message
    //         via voice profile few_shot_examples.death_ritual; check
    //         resurrection availability (Director.checkResurrectionAvailability).
    return failure('Fate Ladder not yet implemented (spec 016 M3).', 'INVALID_ACTION');
  }

  async resolveLadder(
    _resolution: FateLadderResolution,
  ): Promise<GameResult<{ stateChanges: string[] }>> {
    // TODO M3: per chosen option, dispatch:
    //   A → force arc_beat=CHANGE; trigger EpilogueModal (reuse spec 014 M4)
    //   B → validate sacrifice bounded; render epic prose; legacy bond next PC
    //   C → pick from priceTable (forbidden: level drain, hp_max loss);
    //       restore PC to 1 HP Stable Unconscious
    //   D → consume diamond from inventory; revive 1 HP; apply RAW penalty
    //       (-4 d20, -1 per long rest for Raise Dead; none for Revivify)
    return failure('Fate Ladder resolution not yet implemented (spec 016 M3).', 'INVALID_ACTION');
  }

  /**
   * Probe: can option D ("Ressurreição") be offered?
   * Requires ≥1 caster with appropriate spell + diamante in inventory + time window.
   */
  protected async checkResurrectionAvailability(
    _characterId: string,
  ): Promise<{
    available: boolean;
    spellAvailable?: 'Revivify' | 'Raise Dead' | 'Resurrection' | 'True Resurrection';
    diamondGp?: number;
    casterId?: string;
  }> {
    // TODO M3: scan party + nearby NPCs for spell access;
    //         scan inventory for diamond components;
    //         validate time window (Revivify 1min etc.).
    return { available: false };
  }
}
