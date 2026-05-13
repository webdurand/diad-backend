import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RestEventTemplateEntity } from "src/entities";


export interface RestEventPickContext {

  kind: "long";

  locationSafety: number;

  warningAcknowledged: boolean;

  rng?: () => number;
}

export interface RestEventPickResult {
  templateId: string;
  kind: RestEventTemplateEntity["kind"];
  triggerCondition: string;
  weight: number;
  narrativeTemplateId?: string | null;
}

@Injectable()
export class RestEventPickerService {
  constructor(
    @InjectRepository(RestEventTemplateEntity)
    private readonly templateRepo: Repository<RestEventTemplateEntity>,
  ) {}

  async pickForLongRest(
    ctx: RestEventPickContext,
  ): Promise<RestEventPickResult | null> {
    if (ctx.kind !== "long") return null;

    const all = await this.templateRepo.find();
    if (all.length === 0) return null;


    const candidates = all.filter((t) => {
      if (t.kind === "hostile_interruption") {
        return ctx.warningAcknowledged && ctx.locationSafety <= 2;
      }
      return true;
    });

    if (candidates.length === 0) return null;

    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight <= 0) return null;

    const rng = ctx.rng ?? Math.random;
    let r = rng() * totalWeight;
    for (const t of candidates) {
      if (r < t.weight) {
        return {
          templateId: t.id,
          kind: t.kind,
          triggerCondition: t.triggerCondition,
          weight: t.weight,
          narrativeTemplateId: t.narrativeTemplateId ?? null,
        };
      }
      r -= t.weight;
    }

    const last = candidates[candidates.length - 1];
    return {
      templateId: last.id,
      kind: last.kind,
      triggerCondition: last.triggerCondition,
      weight: last.weight,
      narrativeTemplateId: last.narrativeTemplateId ?? null,
    };
  }
}
