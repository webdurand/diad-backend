import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { randomUUID } from "crypto";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import { NpcEntity } from "src/entities/npc.entity";
import { DiadLogger } from "../../observability/logger/diad-logger.service";
import { EventListener } from "../event-bus.types";
import { EventBusService } from "../event-bus.service";
import { EventEnvelopeFactory } from "../event-envelope.factory";
import {
  EventCategory,
  EventEnvelope,
} from "../event-envelope.types";

const GUARD_DISPATCH_CONFIG = {
  // Quantos guards spawnam por nível de severity (1=witness leve, 3=morte/lethal).
  countBySeverity: { 1: 1, 2: 2, 3: 3 } as Record<number, number>,
  // Atraso em turns até guards chegarem na cena.
  delayTurnsBySeverity: { 1: 2, 2: 2, 3: 1 } as Record<number, number>,
  // Slugs de monstros que contam como "guard authority" disponíveis.
  monsterSlugs: ["guard", "veteran", "knight"] as const,
  // Slug primário usado quando precisa spawnar do template.
  primarySpawnSlug: "guard" as const,
  // Pool de nomes próprios pros guards auto-spawnados.
  spawnNamePool: [
    "Marek",
    "Telon",
    "Veska",
    "Doran",
    "Asha",
    "Bren",
    "Korin",
    "Mira",
  ] as const,
  // Disposição inicial dos guards spawnados.
  initialDisposition: "hostile" as const,
  provenance: "auto-materialized" as const,
  tags: ["auto-spawned-guard", "crime-response"] as const,
} as const;

@Injectable()
export class GuardDispatchListener implements EventListener {
  readonly name = "GuardDispatchListener";
  readonly categories: readonly EventCategory[] = ["NarrativeEvent"];

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    @InjectRepository(NpcEntity)
    private readonly npcRepo: Repository<NpcEntity>,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly logger: DiadLogger,
    private readonly dataSource: DataSource,
  ) {
    this.logger.setContext(GuardDispatchListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "npc_witnessed_event") return;
    if (await this.alreadyProcessed(envelope.eventId)) return;

    const severity = Number(envelope.payload?.severity ?? 1);
    if (severity < 2) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const locationId = envelope.payload?.locationId as string | undefined;
    const campaignId = envelope.scope.campaignId;
    if (!locationId || !campaignId) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const desiredCount =
      GUARD_DISPATCH_CONFIG.countBySeverity[Math.min(severity, 3)] ?? 1;

    const existing = await this.findGuardsInLocation(
      campaignId,
      locationId,
      desiredCount,
    );

    let guardIds: string[];
    if (existing.length >= desiredCount) {
      guardIds = existing.slice(0, desiredCount);
    } else {
      const missing = desiredCount - existing.length;
      const spawned = await this.spawnGuards(campaignId, locationId, missing);
      guardIds = [...existing, ...spawned];
    }

    if (guardIds.length === 0) {
      this.logger.warn("guard_dispatch.no_template_available", {
        "event.id": envelope.eventId,
        "campaign.id": campaignId,
        "location.id": locationId,
        "monster.slug.primary": GUARD_DISPATCH_CONFIG.primarySpawnSlug,
      });
      await this.markProcessed(envelope.eventId);
      return;
    }

    const delayTurns =
      GUARD_DISPATCH_CONFIG.delayTurnsBySeverity[Math.min(severity, 3)] ?? 2;

    try {
      const built = this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "guard_dispatched",
        source: {
          service: "diad-backend",
          module: "GuardDispatchListener",
          traceId: envelope.source.traceId,
        },
        scope: {
          campaignId,
          sessionId: envelope.scope.sessionId,
          sceneId: envelope.scope.sceneId,
          encounterId: envelope.scope.encounterId,
        },
        aggregateId: guardIds[0],
        payload: {
          guardWitnessIds: guardIds,
          locationId,
          severity,
          sourceEventId: envelope.eventId,
          delayTurns,
          dispatchReason:
            severity >= 3 ? "lethal_witnessed" : "assault_witnessed",
        },
        narrativeDescriptor:
          severity >= 3
            ? `${guardIds.length} guarda(s) foram acionados — chegada iminente.`
            : `${guardIds.length} guarda(s) observam — chegada em ${delayTurns} turn(s).`,
      });
      await this.eventBus.publish(built);
    } catch (err) {
      this.logger.warn("event_bus.guard_dispatch.publish_failed", {
        "event.id": envelope.eventId,
        "guard.ids": guardIds,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }

    await this.markProcessed(envelope.eventId);
  }

  private async findGuardsInLocation(
    campaignId: string,
    locationId: string,
    limit: number,
  ): Promise<string[]> {
    const slugList = Array.from(GUARD_DISPATCH_CONFIG.monsterSlugs);
    const rows = await this.npcRepo.query(
      `
      SELECT n."id"
      FROM "npcs" n
      LEFT JOIN "monsters" m ON m."id" = n."monster_id"
      WHERE n."campaign_id" = $1
        AND n."current_location_id" = $2
        AND n."status" = 'alive'
        AND (m."slug" = ANY($3::text[]))
      LIMIT $4
      `,
      [campaignId, locationId, slugList, limit],
    );
    if (Array.isArray(rows)) {
      return rows
        .map((r: { id: string }) => r?.id)
        .filter((id: string | undefined): id is string => Boolean(id));
    }
    return [];
  }

  private async spawnGuards(
    campaignId: string,
    locationId: string,
    count: number,
  ): Promise<string[]> {
    if (count <= 0) return [];

    const monsterRows = await this.dataSource.query(
      `SELECT id FROM monsters WHERE slug = $1 LIMIT 1`,
      [GUARD_DISPATCH_CONFIG.primarySpawnSlug],
    );
    const monsterId =
      Array.isArray(monsterRows) && monsterRows.length > 0
        ? (monsterRows[0]?.id as string | undefined)
        : undefined;
    if (!monsterId) return [];

    const usedNamesRows = await this.dataSource.query(
      `SELECT name FROM npcs WHERE campaign_id = $1`,
      [campaignId],
    );
    const usedNames = new Set<string>(
      Array.isArray(usedNamesRows)
        ? usedNamesRows.map((r: { name: string }) => r.name)
        : [],
    );
    const available = GUARD_DISPATCH_CONFIG.spawnNamePool.filter(
      (n) => !usedNames.has(`Guarda ${n}`),
    );

    const created: string[] = [];
    const target = Math.min(count, available.length);
    for (let i = 0; i < target; i++) {
      const properName = available[i];
      const fullName = `Guarda ${properName}`;
      const slug = `guarda-${properName.toLowerCase()}-${randomUUID().slice(0, 8)}`;
      try {
        const saved = await this.npcRepo.save(
          this.npcRepo.create({
            campaignId,
            monsterId,
            currentLocationId: locationId,
            name: fullName,
            slug,
            status: "alive",
            disposition: GUARD_DISPATCH_CONFIG.initialDisposition,
            provenance: GUARD_DISPATCH_CONFIG.provenance,
            tags: [...GUARD_DISPATCH_CONFIG.tags],
          }),
        );
        created.push(saved.id);
      } catch (err) {
        this.logger.warn("guard_dispatch.spawn_failed", {
          "campaign.id": campaignId,
          "location.id": locationId,
          "name": fullName,
          "error.message":
            err instanceof Error ? err.message : String(err),
        });
      }
    }
    return created;
  }

  private async alreadyProcessed(eventId: string): Promise<boolean> {
    const found = await this.processedRepo.findOne({
      where: { listenerName: this.name, eventId },
      select: ["id"],
    });
    return !!found;
  }

  private async markProcessed(eventId: string): Promise<void> {
    try {
      await this.processedRepo.save(
        this.processedRepo.create({ listenerName: this.name, eventId }),
      );
    } catch (err) {
      this.logger.warn("event_bus.guard_dispatch.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
