import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
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

/**
 * Spec 027 (M2, AC2.5) — GuardDispatchListener (M2 stub).
 *
 * Reage a `NarrativeEvent.npc_witnessed_event` quando severity ≥ 2 e há ao
 * menos 1 NPC com archetype 'guard' presente no mesmo location_id (ou faction
 * 'city-watch'). Em M2, apenas EMITE `NarrativeEvent.guard_dispatched` com
 * delay e payload — orchestration real (clock advance + materialização via
 * `start_encounter_from_narrative`) fica em AC3.1 / M3 com GuardDispatchService
 * cron.
 *
 * Pattern: BG3 Patch 7 crime model — guards "respondem" só se um witness com
 * archetype guard existir OU se a cena estava no `city-watch` patrol radius.
 * Esta listener cobre o primeiro caso (lookup por archetype).
 *
 * Idempotente via `event_listener_processed`.
 */
@Injectable()
export class GuardDispatchListener implements EventListener {
  readonly name = "GuardDispatchListener";
  readonly categories: readonly EventCategory[] = ["NarrativeEvent"];

  // Tags do NPC archetype que disparam dispatch (consultadas em
  // `npc_archetype_templates` via campos do NpcEntity ou simplesmente via
  // tags JSONB). M2 stub: lookup pela coluna `monster_id` resolvendo slug.
  private static readonly GUARD_TAG_SLUGS = new Set([
    "guard",
    "veteran",
    "knight",
  ]);

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    @InjectRepository(NpcEntity)
    private readonly npcRepo: Repository<NpcEntity>,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(GuardDispatchListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "npc_witnessed_event") return;
    if (await this.alreadyProcessed(envelope.eventId)) return;

    const severity = Number(envelope.payload?.severity ?? 1);
    if (severity < 2) {
      // Soft severity não dispatcha guards.
      await this.markProcessed(envelope.eventId);
      return;
    }

    const locationId = envelope.payload?.locationId as string | undefined;
    const campaignId = envelope.scope.campaignId;
    if (!locationId || !campaignId) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const guardWitnessId = await this.findGuardInLocation(
      campaignId,
      locationId,
    );

    if (!guardWitnessId) {
      // Sem guards na cena → sem dispatch automático. M3 vai checar patrol
      // radius via `npc_patrols` (não existe ainda).
      await this.markProcessed(envelope.eventId);
      return;
    }

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
        aggregateId: guardWitnessId,
        payload: {
          guardWitnessId,
          locationId,
          severity,
          sourceEventId: envelope.eventId,
          delaySec: severity >= 3 ? 30 : 90,
          dispatchReason:
            severity >= 3 ? "lethal_witnessed" : "assault_witnessed",
        },
        narrativeDescriptor:
          severity >= 3
            ? "Um guarda viu — a guarda foi acionada."
            : "Um guarda observa — algo será relatado.",
      });
      await this.eventBus.publish(built);
    } catch (err) {
      this.logger.warn("event_bus.guard_dispatch.publish_failed", {
        "event.id": envelope.eventId,
        "guard.id": guardWitnessId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }

    await this.markProcessed(envelope.eventId);
  }

  /**
   * M2 stub — lookup direto por slug de monster (archetype) via JOIN.
   * Resolve guard se algum NPC alive na location tem monster_id mapeado pra
   * slug em `GUARD_TAG_SLUGS`. M3 vai consultar `npc_archetype_templates`
   * já existente (1784000000000-CreateNpcArchetypeTemplates).
   */
  private async findGuardInLocation(
    campaignId: string,
    locationId: string,
  ): Promise<string | null> {
    const slugList = Array.from(GuardDispatchListener.GUARD_TAG_SLUGS);
    const rows = await this.npcRepo.query(
      `
      SELECT n."id"
      FROM "npcs" n
      LEFT JOIN "monsters" m ON m."id" = n."monster_id"
      WHERE n."campaign_id" = $1
        AND n."current_location_id" = $2
        AND n."status" = 'alive'
        AND (m."slug" = ANY($3::text[]))
      LIMIT 1
      `,
      [campaignId, locationId, slugList],
    );
    if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) {
      return rows[0].id as string;
    }
    return null;
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
