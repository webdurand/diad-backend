/**
 * Spec 020 — ToolEventEmitService.
 *
 * Helper de emit de events cross-domain para tools que wrappam endpoints
 * existentes (move_npc, create_npc_from_narrative, set_currency, remove_item,
 * apply_condition_narrative). Centraliza envelope build + audience tags.
 *
 * Os endpoints originais (NpcService.moveNpc, InventoryService.removeItem etc.)
 * permanecem com semântica RAW; este service apenas dispara o evento. Caller
 * (controller wrapper) chama emit_* APÓS o sucesso da operação.
 *
 * Princípio X: state delta + metadata + narrativeDescriptor.
 * Best-effort: falha na publish não bloqueia retorno HTTP.
 */

import { Injectable } from "@nestjs/common";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";

export interface NpcMovedEvent {
  campaignId: string;
  npcId: string;
  npcName?: string;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  reason: string;
  traceId?: string;
}

export interface NpcCreatedEvent {
  campaignId: string;
  npcId: string;
  name: string;
  locationId: string;
  roleHint: string;
  narrativeSeed?: string;
  traceId?: string;
}

export interface ItemLostEvent {
  campaignId: string;
  characterId: string;
  itemId: string;
  itemName?: string;
  reason: string;
  narrativeDescriptor?: string;
  traceId?: string;
}

export interface CurrencyChangedEvent {
  campaignId: string;
  characterId: string;
  delta: { cp: number; sp: number; gp: number; pp: number };
  balanceAfter: { cp: number; sp: number; gp: number; pp: number };
  reason: string;
  traceId?: string;
}

export interface ConditionAddedEvent {
  campaignId: string;
  targetId: string;
  targetType: "pc" | "npc";
  conditionSlug: string;
  source: string;
  durationHint?: string;
  variant: "combat" | "narrative";
  traceId?: string;
}

@Injectable()
export class ToolEventEmitService {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
  ) {}

  async emitNpcMoved(ev: NpcMovedEvent): Promise<void> {
    return this.publishSafe({
      eventCategory: "NarrativeEvent",
      eventType: "npc_moved",
      module: "ToolEventEmitService.emitNpcMoved",
      campaignId: ev.campaignId,
      payload: {
        npcId: ev.npcId,
        npcName: ev.npcName,
        fromLocationId: ev.fromLocationId ?? null,
        toLocationId: ev.toLocationId ?? null,
        reason: ev.reason,
      },
      narrativeDescriptor: `${ev.npcName ?? "NPC"} mudou de local: ${ev.reason}`,
      traceId: ev.traceId,
    });
  }

  async emitNpcCreated(ev: NpcCreatedEvent): Promise<void> {
    return this.publishSafe({
      eventCategory: "NarrativeEvent",
      eventType: "npc_created",
      module: "ToolEventEmitService.emitNpcCreated",
      campaignId: ev.campaignId,
      payload: {
        npcId: ev.npcId,
        name: ev.name,
        locationId: ev.locationId,
        roleHint: ev.roleHint,
        narrativeSeed: ev.narrativeSeed,
      },
      narrativeDescriptor: `Novo NPC '${ev.name}' (${ev.roleHint}) materializado.`,
      traceId: ev.traceId,
    });
  }

  async emitItemLost(ev: ItemLostEvent): Promise<void> {
    return this.publishSafe({
      eventCategory: "SocialEvent",
      eventType: "item_lost",
      module: "ToolEventEmitService.emitItemLost",
      campaignId: ev.campaignId,
      payload: {
        characterId: ev.characterId,
        itemId: ev.itemId,
        itemName: ev.itemName,
        reason: ev.reason,
      },
      narrativeDescriptor:
        ev.narrativeDescriptor ??
        `Item perdido (${ev.reason}): ${ev.itemName ?? "item"}.`,
      traceId: ev.traceId,
    });
  }

  async emitCurrencyChanged(ev: CurrencyChangedEvent): Promise<void> {
    const totalDelta =
      ev.delta.gp + ev.delta.sp / 10 + ev.delta.cp / 100 + ev.delta.pp * 10;
    const sign = totalDelta >= 0 ? "+" : "";
    return this.publishSafe({
      eventCategory: "SocialEvent",
      eventType: "currency_changed",
      module: "ToolEventEmitService.emitCurrencyChanged",
      campaignId: ev.campaignId,
      payload: {
        characterId: ev.characterId,
        delta: ev.delta,
        balanceAfter: ev.balanceAfter,
        reason: ev.reason,
      },
      narrativeDescriptor: `${sign}${totalDelta.toFixed(2)}gp eq. (${ev.reason}).`,
      traceId: ev.traceId,
    });
  }

  async emitConditionAdded(ev: ConditionAddedEvent): Promise<void> {
    return this.publishSafe({
      eventCategory: "EncounterEvent",
      eventType: "condition_added",
      module: "ToolEventEmitService.emitConditionAdded",
      campaignId: ev.campaignId,
      payload: {
        participantId: ev.targetId,
        targetType: ev.targetType,
        condition: ev.conditionSlug,
        sourceFeatureId: ev.source,
        durationRounds: null,
        appliedDuring: ev.variant,
      },
      narrativeDescriptor: `${ev.conditionSlug} aplicado (${ev.variant}, ${ev.source}).`,
      traceId: ev.traceId,
    });
  }

  private async publishSafe(args: {
    eventCategory: "EncounterEvent" | "WorldEvent" | "NarrativeEvent" | "SocialEvent";
    eventType: string;
    module: string;
    campaignId: string;
    payload: Record<string, unknown>;
    narrativeDescriptor?: string;
    traceId?: string;
  }): Promise<void> {
    try {
      const envelope = this.factory.build({
        eventCategory: args.eventCategory,
        eventType: args.eventType,
        source: {
          service: "diad-backend",
          module: args.module,
          traceId: args.traceId,
        },
        scope: { campaignId: args.campaignId },
        payload: args.payload,
        narrativeDescriptor: args.narrativeDescriptor,
      });
      await this.eventBus.publish(envelope);
    } catch {
      /* best-effort — falha de event não bloqueia tool. */
    }
  }
}
