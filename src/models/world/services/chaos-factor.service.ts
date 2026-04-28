import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CampaignEntity } from "src/entities/campaign.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

export type ChaosSource = "player" | "director" | "event";

/**
 * Spec 019 — chaos factor é DM-controlled (Director agent ou consequência
 * narrativa). Player **não** ajusta — endpoint exige `source` ∈ {director,event}.
 *
 * Decisão do user 2026-04-27: removido slider do player (chaos é decidido pelo
 * mundo, não pelo jogador). Endpoint mantém `source=player` reservado pra V2
 * caso futuramente exponha controle, mas backend não emite via cookie auth.
 */
@Injectable()
export class ChaosFactorService {
  constructor(
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
  ) {}

  async setChaosFactor(
    campaignId: string,
    value: number,
    source: ChaosSource,
    options: { traceId?: string } = {},
  ): Promise<{ campaignId: string; oldValue: number; newValue: number }> {
    if (!Number.isInteger(value) || value < 1 || value > 9) {
      throw new DomainException(
        ErrorCode.CHAOS_OUT_OF_RANGE,
        `chaosFactor deve ser inteiro 1..9 (recebido: ${value}).`,
        { context: { value }, hint: "Mythic GME chaos: 1=ordem, 9=caos." },
      );
    }
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new DomainException(
        ErrorCode.CAMPAIGN_NOT_FOUND,
        `Campaign ${campaignId} não encontrada.`,
      );
    }
    const oldValue = campaign.chaosFactor;
    if (oldValue === value) {
      return { campaignId, oldValue, newValue: value };
    }
    campaign.chaosFactor = value;
    await this.campaignRepo.save(campaign);

    const envelope = this.factory.build({
      eventCategory: "WorldEvent",
      eventType: "chaos_factor_changed",
      source: {
        service: "diad-backend",
        module: "ChaosFactorService.setChaosFactor",
        traceId: options.traceId,
      },
      scope: { campaignId },
      payload: {
        campaignId,
        oldValue,
        newValue: value,
        source,
      },
      narrativeDescriptor:
        value > oldValue
          ? "O caos cresce — algo está se movendo."
          : "A tensão se acalma momentaneamente.",
    });
    try {
      await this.eventBus.publish(envelope);
    } catch {
      /* best-effort */
    }

    return { campaignId, oldValue, newValue: value };
  }
}
