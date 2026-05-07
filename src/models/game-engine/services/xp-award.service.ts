import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CharacterStateEntity,
  CampaignEntity,
  XpAwardEventEntity,
} from "src/entities";
import type { XpAwardSource } from "src/entities/xp-award-event.entity";
import { CharacterStateService } from "../../characters/services/character-state.service";
import { GameResult, failure, success } from "../interfaces/result.type";

/**
 * Spec 016 M4 — XP Award service granular.
 *
 * RAW 2024 default + flag `campaign.xp_mode` ('rules' | 'milestone' | 'hybrid').
 * Paridade BG3: persuasion/stealth resolvendo encounter dá XP igual ao kill
 * (anti-grind). Audit log em `xp_award_events` permite Director memory L4
 * citar awards passados.
 *
 * Modes:
 *  - rules:     amount cru aplicado.
 *  - milestone: ignora amount, só passa em quest_completion (amount fixo
 *               do threshold do próximo nível) ou quest_step (½ threshold).
 *  - hybrid:    combat_kill + skill_challenge + combat_resolved_peacefully
 *               passam cru; roleplay/exploration ignorados (story XP só em
 *               quest milestones).
 *
 * Ver `specs/016-play-shell-foundation/spec.md` §7.1.
 */
export interface XpAwardRequest {
  characterId: string;
  amount: number;
  source: XpAwardSource;
  reason: string;
  encounterId?: string;
  questStepId?: string;
  narrativeJustification?: string;
  /** Required: userId pra ownership check em updateXp. */
  ownerUserId: string;
  /** Optional: campaignId pra resolver xp_mode. Default 'rules' se não informado. */
  campaignId?: string;
}

export interface XpAwardResult {
  awardedXp: number;
  totalXp: number;
  nextLevelXp: number | null;
  levelUpReady: boolean;
  eventId: string;
  modeApplied: "rules" | "milestone" | "hybrid";
}

@Injectable()
export class XpAwardService {
  constructor(
    @InjectRepository(CharacterStateEntity)
    private readonly stateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(XpAwardEventEntity)
    private readonly xpEventRepo: Repository<XpAwardEventEntity>,
    private readonly characterStateService: CharacterStateService,
  ) {}

  async awardXp(request: XpAwardRequest): Promise<GameResult<XpAwardResult>> {
    if (request.amount < 0) {
      return failure("Amount de XP deve ser positivo.", "INVALID_ACTION");
    }

    if (request.campaignId && (await this.isSandbox(request.campaignId))) {
      const xpResult = await this.characterStateService.updateXp(
        request.ownerUserId,
        request.characterId,
        { amount: 0 },
      );
      return success({
        awardedXp: 0,
        totalXp: xpResult.xp,
        nextLevelXp: xpResult.nextLevelXp,
        levelUpReady: xpResult.levelUpAvailable,
        eventId: "sandbox-skip",
        modeApplied: "rules",
      });
    }

    const mode = await this.resolveXpMode(request.campaignId);
    const adjusted = this.adjustForMode(request.amount, request.source, mode);

    if (adjusted === 0) {
      // Mode bloqueia este tipo de award. Ainda registra evento (audit) com 0.
      const evt = await this.xpEventRepo.save(
        this.xpEventRepo.create({
          characterId: request.characterId,
          amount: 0,
          source: request.source,
          reason: request.reason + " [skipped:" + mode + "]",
          encounterId: request.encounterId,
          questStepId: request.questStepId,
          narrativeJustification: request.narrativeJustification,
        }),
      );
      const xpResult = await this.characterStateService.updateXp(
        request.ownerUserId,
        request.characterId,
        { amount: 0 },
      );
      return success({
        awardedXp: 0,
        totalXp: xpResult.xp,
        nextLevelXp: xpResult.nextLevelXp,
        levelUpReady: xpResult.levelUpAvailable,
        eventId: evt.id,
        modeApplied: mode,
      });
    }

    const evt = await this.xpEventRepo.save(
      this.xpEventRepo.create({
        characterId: request.characterId,
        amount: adjusted,
        source: request.source,
        reason: request.reason,
        encounterId: request.encounterId,
        questStepId: request.questStepId,
        narrativeJustification: request.narrativeJustification,
      }),
    );

    const xpResult = await this.characterStateService.updateXp(
      request.ownerUserId,
      request.characterId,
      { amount: adjusted },
    );

    return success({
      awardedXp: adjusted,
      totalXp: xpResult.xp,
      nextLevelXp: xpResult.nextLevelXp,
      levelUpReady: xpResult.levelUpAvailable,
      eventId: evt.id,
      modeApplied: mode,
    });
  }

  private async isSandbox(campaignId: string): Promise<boolean> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
      select: ["id", "isSandbox"],
    });
    return campaign?.isSandbox === true;
  }

  private async resolveXpMode(
    campaignId?: string,
  ): Promise<"rules" | "milestone" | "hybrid"> {
    if (!campaignId) return "rules";
    const campaign = (await this.campaignRepo.findOne({
      where: { id: campaignId },
    })) as (CampaignEntity & { xpMode?: string }) | null;
    const mode =
      (campaign as any)?.xp_mode ?? (campaign as any)?.xpMode ?? "rules";
    if (mode === "milestone" || mode === "hybrid") return mode;
    return "rules";
  }

  private adjustForMode(
    amount: number,
    source: XpAwardSource,
    mode: "rules" | "milestone" | "hybrid",
  ): number {
    if (mode === "rules") return amount;
    if (mode === "milestone") {
      // Só quest_step e quest_completion contam. Outros skip.
      return source === "quest_step" || source === "quest_completion"
        ? amount
        : 0;
    }
    // hybrid: combat + skill_challenge passam; roleplay/exploration skip.
    if (
      source === "combat_kill" ||
      source === "combat_resolved_peacefully" ||
      source === "skill_challenge" ||
      source === "quest_step" ||
      source === "quest_completion"
    ) {
      return amount;
    }
    return 0;
  }
}
