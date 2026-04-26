import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RestEventTemplateEntity } from 'src/entities';

/**
 * Spec 016 M4 — Rest Event Picker (BG3-inspired weighted roll).
 *
 * Pool priorizado: bond > chekhov > dream > mythic > interruption > nothing.
 * Max 1 event/long rest (anti-overload). Hostile location warning + safety
 * penalty pode no-op o pick (interruption só dispara se safety<=2).
 *
 * Picker é deterministic-given-rng pra testabilidade. RNG injetada
 * (default Math.random).
 *
 * Ver `specs/016-play-shell-foundation/spec.md` §6.4.
 */
export interface RestEventPickContext {
  /** Long rest only — short rest não dispara events. */
  kind: 'long';
  /** Score de safety da location atual (0-5). Se <=2, pode pular pick. */
  locationSafety: number;
  /** Player acknowledged warning de hostile? Se false, suprime interrupt. */
  warningAcknowledged: boolean;
  /** Rng injetada pra testes. */
  rng?: () => number;
}

export interface RestEventPickResult {
  templateId: string;
  kind: RestEventTemplateEntity['kind'];
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
    if (ctx.kind !== 'long') return null;

    const all = await this.templateRepo.find();
    if (all.length === 0) return null;

    // Hostile-suppression: se warning não foi acknowledged, remove interrupts.
    const candidates = all.filter((t) => {
      if (t.kind === 'hostile_interruption') {
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
    // Fallback: último candidate (shouldn't happen given totalWeight>0).
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
