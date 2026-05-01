import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { CampaignPlayerEntity } from "src/entities/campaign-player.entity";
import { EncounterService } from "./encounter.service";

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
    private readonly encounterService: EncounterService,
  ) {}

  /**
   * Verifica + resolve, idempotente. Retorna outcome aplicado, ou null se:
   *  - Encounter ainda em andamento (alvo vivo dos dois lados)
   *  - Encounter já não está 'active' (resolveEncounter idempotente, mas log skip)
   *  - Campanha é multiplayer (DM humano resolve)
   *  - Erro de lookup (best-effort, log warn)
   */
  async tryAutoEnd(
    encounterId: string,
  ): Promise<"victory" | "defeat" | null> {
    try {
      const encounter = await this.encounterRepo.findOne({
        where: { id: encounterId },
      });
      if (!encounter || encounter.status !== "active") return null;

      const isSolo = await this.isSoloCampaign(encounter.sessionId);
      if (!isSolo) return null;

      const outcome = await this.detectOutcome(encounterId);
      if (!outcome) return null;

      this.logger.log(
        `auto-end: ${encounterId} → ${outcome} (solo, sem DM humano)`,
      );
      await this.encounterService.resolveEncounter(
        encounterId,
        { outcome },
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
   */
  private async isSoloCampaign(sessionId: string): Promise<boolean> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: ["id", "campaignId"],
    });
    if (!session?.campaignId) return false;

    const distinctUsers = await this.campaignPlayerRepo
      .createQueryBuilder("cp")
      .select("COUNT(DISTINCT cp.user_id)", "n")
      .where("cp.campaign_id = :cid", { cid: session.campaignId })
      .andWhere("cp.is_active = true")
      .getRawOne<{ n: string }>();
    const n = Number(distinctUsers?.n ?? 0);
    return n <= 1;
  }
}
