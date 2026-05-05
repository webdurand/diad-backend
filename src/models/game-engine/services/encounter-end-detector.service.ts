import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { CampaignPlayerEntity } from "src/entities/campaign-player.entity";
import { CharacterEntity } from "src/entities/character.entity";
import { EncounterService } from "./encounter.service";
import {
  EncounterDifficulty,
  LootRollService,
  type CRBand,
} from "./loot-roll.service";
import type { PartyTier } from "./magic-item-selector.service";

const ENCOUNTER_TO_LOOT_DIFFICULTY: Record<string, EncounterDifficulty> = {
  trivial: "trivial",
  easy: "easy",
  medium: "medium",
  hard: "hard",
  deadly: "deadly",
};

function deriveTier(level: number): PartyTier {
  if (level <= 4) return "1";
  if (level <= 10) return "2";
  if (level <= 16) return "3";
  return "4";
}

/**
 * Spec 027 (M2 follow-up) — auto-detecta fim de combate em DIAD solo.
 *
 * Premissa de design (alinhada à conversa do usuário):
 *  - Em DIAD solo a IA é o DM. Player não controla NPC nem encerra combate.
 *  - Em multiplayer DM-led o DM humano clica "encerrar combate" manualmente
 *    quando narrativa exige (PCs renderem, NPC fugiu sem morrer, etc).
 *
 * Por isso `tryAutoEnd` é GATEADO por `isSoloCampaign`. Multiplayer não é
 * afetado — comportamento atual preservado integralmente.
 *
 * Heurística "solo": campaign tem ≤1 user_id distinto em campaign_players
 * (espelha PermissionResolver.isCampaignDm). Se há 2+ humanos é multiplayer
 * — desativa auto-end.
 *
 * Outcomes:
 *  - Todos hostis (type ∈ {monster,npc} + faction='enemy') derrotados → victory
 *  - Todos PCs caídos (HP≤0 ou dyingState='dead') → defeat
 *  - Senão: null (combate continua)
 */
@Injectable()
export class EncounterEndDetectorService {
  private readonly logger = new Logger(EncounterEndDetectorService.name);

  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(CampaignPlayerEntity)
    private readonly campaignPlayerRepo: Repository<CampaignPlayerEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    private readonly encounterService: EncounterService,
    private readonly lootRollService: LootRollService,
  ) {}

  /**
   * Verifica + resolve, idempotente. Retorna outcome aplicado, ou null se:
   *  - Encounter ainda em andamento (alvo vivo dos dois lados)
   *  - Encounter já não está 'active' (resolveEncounter idempotente, mas log skip)
   *  - Campanha é multiplayer (DM humano resolve)
   *  - Erro de lookup (best-effort, log warn)
   *
   * Em vitória: calcula XP somando `monster.xp` dos hostis derrotados, rola
   * loot transient via `LootRollService` por CR band do hostil mais forte,
   * e injeta `xpRewards` + `goldRewards` no payload do `resolveEncounter`.
   */
  async tryAutoEnd(
    encounterId: string,
  ): Promise<"victory" | "defeat" | null> {
    try {
      const encounter = await this.encounterRepo.findOne({
        where: { id: encounterId },
      });
      if (!encounter || encounter.status !== "active") return null;

      const soloInfo = await this.isSoloCampaign(encounter.sessionId);
      if (!soloInfo.isSolo) return null;

      const outcome = await this.detectOutcome(encounterId);
      if (!outcome) return null;

      const payload: {
        outcome: "victory" | "defeat";
        xpRewards?: { mode: "equal-split"; value: number };
        goldRewards?: { cp?: number; sp?: number; gp?: number; pp?: number };
        itemRewards?: Array<{
          name: string;
          quantity: number;
          magicItemId?: string;
          equipmentId?: string;
        }>;
      } = { outcome };

      if (outcome === "victory") {
        const rewards = await this.computeVictoryRewards(
          encounterId,
          soloInfo.campaignId,
        );
        if (rewards.totalXp > 0) {
          payload.xpRewards = {
            mode: "equal-split",
            value: rewards.totalXp,
          };
        }
        if (rewards.gold && this.hasAnyCurrency(rewards.gold)) {
          payload.goldRewards = rewards.gold;
        }
        if (rewards.items && rewards.items.length > 0) {
          payload.itemRewards = rewards.items;
        }
        this.logger.log(
          `auto-end victory rewards: encounter=${encounterId} xp=${rewards.totalXp} ` +
            `crBand=${rewards.crBand ?? "n/a"} gp=${rewards.gold?.gp ?? 0} ` +
            `items=${rewards.items?.length ?? 0} ` +
            `difficulty=${rewards.difficulty ?? "n/a"} ` +
            `monstersConsidered=${rewards.defeatedCount}`,
        );
      }

      this.logger.log(
        `auto-end: ${encounterId} → ${outcome} (solo, sem DM humano)`,
      );
      await this.encounterService.resolveEncounter(
        encounterId,
        payload,
        "system",
      );
      return outcome;
    } catch (err) {
      this.logger.warn(
        `auto-end falhou em ${encounterId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Soma XP + rola loot transient para vitória solo. Best-effort: erros
   * em loot-roll não invalidam XP. Retorna estrutura plana pra `tryAutoEnd`.
   */
  private async computeVictoryRewards(
    encounterId: string,
    campaignId: string | undefined,
  ): Promise<{
    totalXp: number;
    crBand: CRBand | null;
    gold: { cp: number; sp: number; gp: number; pp: number } | null;
    items: Array<{
      name: string;
      quantity: number;
      magicItemId?: string;
      equipmentId?: string;
    }> | null;
    difficulty: EncounterDifficulty | null;
    defeatedCount: number;
  }> {
    const participants = await this.participantRepo.find({
      where: { encounterId },
      relations: ["monster"],
    });

    const defeatedHostiles = participants.filter(
      (p) =>
        p.controlledBy === "ai" &&
        p.faction === "enemy" &&
        (p.isDefeated || (p.currentHp ?? 0) <= 0),
    );

    const totalXp = defeatedHostiles.reduce(
      (sum, p) => sum + (p.monster?.xp ?? 0),
      0,
    );

    const maxCr = defeatedHostiles.reduce((max, p) => {
      const cr = p.monster?.challenge_rating ?? 0;
      return cr > max ? cr : max;
    }, 0);
    const crBand = this.crToBand(maxCr);

    let gold: { cp: number; sp: number; gp: number; pp: number } | null = null;
    let items: Array<{
      name: string;
      quantity: number;
      magicItemId?: string;
      equipmentId?: string;
    }> | null = null;
    let difficulty: EncounterDifficulty | null = null;

    if (campaignId && crBand) {
      const partyContext = await this.resolvePartyContext(
        participants,
        encounterId,
      );
      difficulty = partyContext.difficulty;
      try {
        const result = await this.lootRollService.roll({
          campaignId,
          crBand,
          hoardOrIndividual: "individual",
          encounterDifficulty: partyContext.difficulty,
          partyTier: partyContext.tier,
        });
        gold = result.currency;
        items = result.items.length > 0 ? result.items : null;
      } catch (err) {
        this.logger.warn(
          `loot-roll falhou em ${encounterId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      totalXp,
      crBand,
      gold,
      items,
      difficulty,
      defeatedCount: defeatedHostiles.length,
    };
  }

  private async resolvePartyContext(
    participants: EncounterParticipantEntity[],
    encounterId: string,
  ): Promise<{ tier: PartyTier; difficulty: EncounterDifficulty }> {
    const characterIds = participants
      .filter((p) => p.type === "pc" && !!p.characterId)
      .map((p) => p.characterId as string);

    let partyLevels: number[] = [];
    if (characterIds.length > 0) {
      const characters = await this.characterRepo.find({
        where: { id: In(characterIds) },
        relations: ["character_classes"],
      });
      partyLevels = characters.map((c) => {
        const total =
          c.character_classes?.reduce(
            (sum, cc) => sum + (cc.class_level ?? 0),
            0,
          ) ?? 0;
        return total > 0 ? total : 1;
      });
    }

    const avgLevel =
      partyLevels.length > 0
        ? Math.round(
            partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length,
          )
        : 1;

    let difficulty: EncounterDifficulty = "medium";
    try {
      const calc = await this.encounterService.calculateDifficulty(
        encounterId,
        partyLevels.length > 0 ? partyLevels : [1],
      );
      difficulty =
        ENCOUNTER_TO_LOOT_DIFFICULTY[calc.threshold] ?? "medium";
    } catch (err) {
      this.logger.warn(
        `calculateDifficulty falhou em ${encounterId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { tier: deriveTier(avgLevel), difficulty };
  }

  private crToBand(cr: number): CRBand | null {
    if (cr <= 0) return null;
    if (cr <= 4) return "cr_0_4";
    if (cr <= 10) return "cr_5_10";
    if (cr <= 16) return "cr_11_16";
    return "cr_17_plus";
  }

  private hasAnyCurrency(c: {
    cp: number;
    sp: number;
    gp: number;
    pp: number;
  }): boolean {
    return c.cp > 0 || c.sp > 0 || c.gp > 0 || c.pp > 0;
  }

  /**
   * Detecção pura — sem mutar nada. Útil pra diagnostics e tests.
   *
   * Regra (DIAD solo): "live tokens DM-hostis === 0 → finaliza combate"
   *
   * Filtros:
   *   - DM tokens = controlledBy='ai' AND faction='enemy'
   *     - 'ai' alone pegaria companion AI / summons (faction='ally'),
   *       que NÃO devem contar como hostil.
   *     - 'enemy' alone pegaria NPCs estáticos sem `controlledBy='ai'`
   *       (multiplayer DM ainda manual).
   *   - "Down" pra DM token: isDefeated OU hp≤0 (monsters não fazem death save)
   *   - "Down" pra PC: dyingState='dead' APENAS. RAW 5e: PC com hp=0 está
   *     `dying`, faz death saves, combate continua. Só morte real = defeat.
   *     Antes a checagem era `dyingState='dead' || hp≤0` — disparava defeat
   *     prematuro no primeiro hit que zerasse o PC, sem dar chance pro
   *     player jogar (bug reportado).
   */
  async detectOutcome(
    encounterId: string,
  ): Promise<"victory" | "defeat" | null> {
    const participants = await this.participantRepo.find({
      where: { encounterId },
    });
    if (participants.length === 0) return null;

    const dmTokens = participants.filter(
      (p) => p.controlledBy === "ai" && p.faction === "enemy",
    );
    const pcs = participants.filter((p) => p.type === "pc");

    // Encounter sem tokens DM hostis = não era combate; sem PCs = nada pra vencer
    if (dmTokens.length === 0 || pcs.length === 0) return null;

    const allDmTokensDown = dmTokens.every(
      (m) => m.isDefeated || (m.currentHp ?? 0) <= 0,
    );
    if (allDmTokensDown) return "victory";

    // RAW 5e: PC só está fora do combate quando dyingState='dead' (3 death
    // save fails ou massive damage). hp=0 + dying = combate continua.
    const allPcsDead = pcs.every((p) => p.dyingState === "dead");
    if (allPcsDead) return "defeat";

    return null;
  }

  /**
   * Solo = campanha sem DM humano. Espelha PermissionResolver.isCampaignDm.
   * Multiplayer (≥2 user_ids distintos em campaign_players) = NÃO solo.
   *
   * Retorna `campaignId` junto pro caller poder usar em LootRollService /
   * XpAwardService sem segunda query.
   */
  private async isSoloCampaign(
    sessionId: string,
  ): Promise<{ isSolo: boolean; campaignId?: string }> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: ["id", "campaignId"],
    });
    if (!session?.campaignId) return { isSolo: false };

    const distinctUsers = await this.campaignPlayerRepo
      .createQueryBuilder("cp")
      .select("COUNT(DISTINCT cp.user_id)", "n")
      .where("cp.campaign_id = :cid", { cid: session.campaignId })
      .andWhere("cp.is_active = true")
      .getRawOne<{ n: string }>();
    const n = Number(distinctUsers?.n ?? 0);
    return { isSolo: n <= 1, campaignId: session.campaignId };
  }
}
