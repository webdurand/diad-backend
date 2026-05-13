import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AudienceRoutingEntity } from "src/entities/audience-routing.entity";
import { CampaignAudienceOverrideEntity } from "src/entities/campaign-audience-override.entity";
import { DiadLogger } from "../observability/logger/diad-logger.service";
import {
  EventAudience,
  EventCategory,
  EventEnvelope,
} from "./event-envelope.types";

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  audiences: EventAudience[];
  expiresAt: number;
}

interface ResolveOptions {
  campaignId: string;
  eventCategory: EventCategory;
  eventType: string;
}

interface AudienceMapEntry {
  eventCategory: EventCategory;
  eventType: string;
  defaultAudiences: EventAudience[];
  audiences: EventAudience[];
  overrideable: boolean;
  hasOverride: boolean;
  subChannel?: string | null;
}


@Injectable()
export class AudienceMapService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @InjectRepository(AudienceRoutingEntity)
    private readonly routingRepo: Repository<AudienceRoutingEntity>,
    @InjectRepository(CampaignAudienceOverrideEntity)
    private readonly overrideRepo: Repository<CampaignAudienceOverrideEntity>,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(AudienceMapService.name);
  }


  async resolve(envelope: {
    scope: { campaignId: string };
    eventCategory: EventCategory;
    eventType: string;
  }): Promise<EventAudience[]> {
    const cacheKey = this.cacheKey(
      envelope.scope.campaignId,
      envelope.eventCategory,
      envelope.eventType,
    );
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return [...cached.audiences];
    }

    const audiences = await this.computeAudiences({
      campaignId: envelope.scope.campaignId,
      eventCategory: envelope.eventCategory,
      eventType: envelope.eventType,
    });

    this.cache.set(cacheKey, {
      audiences: [...audiences],
      expiresAt: now + CACHE_TTL_MS,
    });
    return audiences;
  }


  async getCampaignMap(campaignId: string): Promise<AudienceMapEntry[]> {
    const [defaults, overrides] = await Promise.all([
      this.routingRepo.find(),
      this.overrideRepo.find({ where: { campaignId } }),
    ]);
    const overrideIndex = this.indexOverrides(overrides);
    return defaults.map((row) => {
      const overrideKey = this.compositeKey(row.eventCategory, row.eventType);
      const override = overrideIndex.get(overrideKey);
      const overrideAudiences = override
        ? (override.audiences as EventAudience[])
        : null;
      const finalAudiences =
        overrideAudiences && row.overrideable
          ? overrideAudiences
          : (row.defaultAudiences as EventAudience[]);
      return {
        eventCategory: row.eventCategory,
        eventType: row.eventType,
        defaultAudiences: row.defaultAudiences as EventAudience[],
        audiences: finalAudiences,
        overrideable: row.overrideable,
        hasOverride: Boolean(overrideAudiences && row.overrideable),
        subChannel: row.subChannel ?? null,
      };
    });
  }


  invalidate(campaignId: string): void {
    const prefix = `${campaignId}::`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }


  clearCache(): void {
    this.cache.clear();
  }

  private async computeAudiences(
    opts: ResolveOptions,
  ): Promise<EventAudience[]> {
    const routing = await this.routingRepo.findOne({
      where: {
        eventCategory: opts.eventCategory,
        eventType: opts.eventType,
      },
    });
    if (!routing) {
      this.logger.warn("event_bus.audience_map.routing_missing", {
        "event.category": opts.eventCategory,
        "event.type": opts.eventType,
      });
      return [];
    }

    const defaults = (routing.defaultAudiences ?? []) as EventAudience[];
    if (!routing.overrideable) {
      return defaults;
    }

    const override = await this.overrideRepo.findOne({
      where: {
        campaignId: opts.campaignId,
        eventCategory: opts.eventCategory,
        eventType: opts.eventType,
      },
    });
    if (!override) return defaults;

    return (override.audiences ?? []) as EventAudience[];
  }

  private indexOverrides(
    overrides: CampaignAudienceOverrideEntity[],
  ): Map<string, CampaignAudienceOverrideEntity> {
    const map = new Map<string, CampaignAudienceOverrideEntity>();
    for (const o of overrides) {
      map.set(this.compositeKey(o.eventCategory, o.eventType), o);
    }
    return map;
  }

  private compositeKey(category: string, type: string): string {
    return `${category}::${type}`;
  }

  private cacheKey(
    campaignId: string,
    category: EventCategory,
    type: string,
  ): string {
    return `${campaignId}::${category}::${type}`;
  }
}

export type { AudienceMapEntry };
