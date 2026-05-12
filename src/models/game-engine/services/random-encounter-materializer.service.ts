import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MonsterEntity } from "src/entities/monster.entity";
import { NpcService } from "src/models/world/services/npc.service";
import {
  StartEncounterFromNarrativeService,
  StartEncounterFromNarrativeResult,
} from "./start-encounter-from-narrative.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

export interface MaterializeRandomEncounterInput {
  campaignId: string;
  sessionId: string;
  sceneId?: string;
  monsterSlugs: string[];
  ownerUserId: string;
  partyAvgLevel: number;
  partySize?: number;
  difficulty: "low" | "moderate" | "high";
  biome?: string;
  reasonChain?: string[];
  traceId?: string;
}

export type MaterializeRandomEncounterResult =
  StartEncounterFromNarrativeResult & {
    monsterSlugs: string[];
    npcIds: string[];
  };

@Injectable()
export class RandomEncounterMaterializerService {
  private readonly logger = new Logger(RandomEncounterMaterializerService.name);

  constructor(
    @InjectRepository(MonsterEntity)
    private readonly monsterRepo: Repository<MonsterEntity>,
    private readonly npcService: NpcService,
    private readonly startEncounter: StartEncounterFromNarrativeService,
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
  ) {}

  async materialize(
    input: MaterializeRandomEncounterInput,
  ): Promise<MaterializeRandomEncounterResult> {
    if (input.monsterSlugs.length === 0) {
      throw new DomainException(
        ErrorCode.ENCOUNTER_NO_TARGETS_IN_SCENE,
        "Random encounter sem monstros — pool vazio.",
        { context: { sessionId: input.sessionId } },
      );
    }

    const monstersBySlug = new Map<string, MonsterEntity>();
    for (const slug of new Set(input.monsterSlugs)) {
      const monster = await this.monsterRepo.findOne({ where: { slug } });
      if (!monster) {
        throw new DomainException(
          ErrorCode.MONSTER_NOT_FOUND,
          `Monstro '${slug}' não encontrado no catálogo.`,
          { context: { slug } },
        );
      }
      monstersBySlug.set(slug, monster);
    }

    const npcIds: string[] = [];
    for (const slug of input.monsterSlugs) {
      const monster = monstersBySlug.get(slug)!;
      const npc = await this.npcService.create(input.campaignId, {
        name: monster.name,
        monsterId: monster.id,
        gameSessionId: input.sessionId,
        initialDisposition: "hostile",
        provenance: "auto-materialized",
        tags: ["random-encounter"],
      });
      npcIds.push(npc.id);
    }

    const startResult = await this.startEncounter.run({
      sessionId: input.sessionId,
      sceneId: input.sceneId,
      campaignId: input.campaignId,
      ownerUserId: input.ownerUserId,
      targetNpcIds: npcIds,
      autoPlaceTokens: true,
      surpriseRound: false,
      narrativeTrigger: this.buildTrigger(input),
      traceId: input.traceId,
    });

    try {
      const envelope = this.factory.build({
        eventCategory: "EncounterEvent",
        eventType: "random_encounter_started",
        source: {
          service: "diad-backend",
          module: "RandomEncounterMaterializerService.materialize",
          traceId: input.traceId,
        },
        scope: {
          campaignId: input.campaignId,
          sessionId: input.sessionId,
          sceneId: input.sceneId,
          encounterId: startResult.encounterId,
        },
        payload: {
          encounterId: startResult.encounterId,
          monsterSlugs: input.monsterSlugs,
          npcIds,
          biome: input.biome ?? null,
          difficulty: input.difficulty,
          partySize: input.partySize ?? 1,
          reasonChain: input.reasonChain ?? [],
        },
        narrativeDescriptor: this.buildTrigger(input),
      });
      await this.eventBus.publish(envelope);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`random_encounter_started publish skipped: ${msg}`);
    }

    return {
      ...startResult,
      monsterSlugs: input.monsterSlugs,
      npcIds,
    };
  }

  private buildTrigger(input: MaterializeRandomEncounterInput): string {
    const counts = new Map<string, number>();
    for (const slug of input.monsterSlugs) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    const parts: string[] = [];
    for (const [slug, n] of counts) {
      parts.push(n > 1 ? `${n}x ${slug}` : slug);
    }
    return `Encontro inesperado: ${parts.join(", ")}`;
  }
}
