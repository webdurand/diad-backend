import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharacterStateEntity, CampaignEntity } from 'src/entities';
import {
  GameResult,
  failure,
} from '../interfaces/result.type';

/**
 * Spec 016 M0 — XP Award service stub.
 *
 * Granular XP awards. RAW 2024 default + flag `campaign.xp_mode`
 * ('rules' | 'milestone' | 'hybrid'). Paridade BG3: persuasion/stealth
 * resolvendo encounter dá XP igual ao kill (anti-grind).
 *
 * Ver `specs/016-play-shell-foundation/spec.md` §7.1 + contract `xp-award.json`.
 *
 * STUB M0 — método retorna `failure('not_implemented')`. M4 wira lógica.
 */
export type XpAwardSource =
  | 'combat_kill'
  | 'combat_resolved_peacefully'
  | 'skill_challenge'
  | 'quest_step'
  | 'quest_completion'
  | 'exploration_milestone'
  | 'roleplay';

export interface XpAwardRequest {
  characterId: string;
  amount: number;
  source: XpAwardSource;
  reason: string;
  encounterId?: string;
  questStepId?: string;
  narrativeJustification?: string;
}

export interface XpAwardResult {
  awardedXp: number;
  totalXp: number;
  nextThreshold: number;
  levelUpReady: boolean;
}

@Injectable()
export class XpAwardService {
  constructor(
    @InjectRepository(CharacterStateEntity)
    private readonly stateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
  ) {}

  async awardXp(
    _request: XpAwardRequest,
  ): Promise<GameResult<XpAwardResult>> {
    // TODO M4: respect campaign.xp_mode ('rules' grants raw amount;
    //         'milestone' coerces to 0 unless source=arc_beat;
    //         'hybrid' allows combat raw + roleplay 0). Update CharacterState.
    //         Emit `level_up_ready` event when threshold crossed.
    return failure('XP award not yet implemented (spec 016 M4).', 'INVALID_ACTION');
  }

  /**
   * BG3 parity rule: encounter resolved peacefully = XP igual ao kill.
   * Anti-exploit: encounter XP só pago 1× independente do método.
   */
  protected async getEncounterXpParity(
    _encounterId: string,
  ): Promise<number> {
    // TODO M4: lookup encounter budget, compute total XP that combat would have awarded.
    return 0;
  }
}
