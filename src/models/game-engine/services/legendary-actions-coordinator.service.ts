import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { LegendaryActionService } from "./legendary-action.service";
import { EncounterSnapshotService } from "./encounter-snapshot.service";
import { AiProxyService } from "src/models/ai-proxy/ai-proxy.service";
import type { GameEventData } from "../interfaces/result.type";


@Injectable()
export class LegendaryActionsCoordinator {
  private readonly logger = new Logger(LegendaryActionsCoordinator.name);

  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly legendaryService: LegendaryActionService,
    private readonly snapshotService: EncounterSnapshotService,
    @Inject(forwardRef(() => AiProxyService))
    private readonly aiProxy: AiProxyService,
  ) {}

  async processAfterPcTurn(
    encounter: EncounterEntity,
    pcParticipantId: string,
  ): Promise<GameEventData[]> {
    const events: GameEventData[] = [];

    const candidates = await this.participantRepo.find({
      where: { encounterId: encounter.id },
      relations: ["monster"],
    });
    const eligible = candidates.filter((p) => {
      if (p.id === pcParticipantId) return false;
      if (p.isDefeated) return false;
      if (p.dyingState === "dead") return false;
      if (p.legendaryPointsAvailable == null) return false;
      if ((p.legendaryPointsAvailable ?? 0) <= 0) return false;
      return true;
    });
    if (eligible.length === 0) return events;

    let snapshot: unknown = null;
    try {
      const snapshotRes = await this.snapshotService.build(
        encounter.id,
        "system",
      );
      if (snapshotRes.ok) snapshot = snapshotRes.value;
    } catch (err) {
      this.logger.warn(`legendary.snapshot_failed: ${(err as Error).message}`);
      return events;
    }

    for (const monster of eligible) {
      try {
        const decision = await this.aiProxy.decideLegendary({
          snapshot,
          monsterParticipantId: monster.id,
          triggerEvent: "after-pc-turn",
        });
        if (!decision.spend || !decision.actionName) continue;

        const fresh = await this.participantRepo.findOne({
          where: { id: monster.id },
          relations: ["monster"],
        });
        if (!fresh) continue;

        const canRes = this.legendaryService.canExecute(
          fresh,
          decision.actionName,
        );
        if (!canRes.ok) {
          this.logger.warn(
            `legendary.canExecute_failed monsterId=${fresh.id} action=${decision.actionName} code=${canRes.code}`,
          );
          continue;
        }
        const spendRes = await this.legendaryService.spendPoints(
          fresh,
          canRes.value.cost,
          decision.actionName,
        );
        events.push(...spendRes.events);


      } catch (err) {
        this.logger.warn(
          `legendary.process_failed monsterId=${monster.id}: ${(err as Error).message}`,
        );
      }
    }

    return events;
  }

  async resetPoolForOwnTurn(
    monster: EncounterParticipantEntity,
  ): Promise<GameEventData[]> {
    const res = await this.legendaryService.resetPool(monster);
    return res.events;
  }
}
