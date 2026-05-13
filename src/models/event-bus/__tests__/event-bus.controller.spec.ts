import { EventBusController } from "../event-bus.controller";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { AudienceMapService } from "src/common/event-bus/audience-map.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { PublishEventDto } from "../dto/publish-event.dto";

function makeFactory(): EventEnvelopeFactory {
  return new EventEnvelopeFactory(undefined);
}

function makeAudienceMap(): AudienceMapService {
  return {
    getCampaignMap: jest.fn().mockResolvedValue([]),
    resolve: jest.fn().mockResolvedValue(["HUD"]),
    invalidate: jest.fn(),
    clearCache: jest.fn(),
  } as unknown as AudienceMapService;
}

function makeBus(): EventBusService {
  return {

    publish: jest.fn().mockImplementation(async (env) => env),
    subscribe: jest.fn(),
    registerListener: jest.fn(),
  } as unknown as EventBusService;
}

const VALID_TRACEPARENT = `00-${"a".repeat(32)}-${"b".repeat(16)}-01`;

const baseDto: PublishEventDto = {
  eventCategory: "EncounterEvent",
  eventType: "damage_applied",
  source: {
    service: "diad-agents",
    module: "narrator.py:render_scene",
  },
  scope: {
    campaignId: "11111111-1111-1111-1111-111111111111",
    sessionId: "22222222-2222-2222-2222-222222222222",
  },
  payload: { participantId: "x", hpBefore: 30, hpAfter: 12, amount: 18 },
  aggregateId: "33333333-3333-3333-3333-333333333333",
};

describe("EventBusController", () => {
  describe("POST /events/publish", () => {
    it("aceita envelope válido com header traceparent W3C e retorna envelope enriched", async () => {
      const bus = makeBus();
      const audienceMap = makeAudienceMap();
      const factory = makeFactory();
      const ctrl = new EventBusController(bus, audienceMap, factory);

      const result = await ctrl.publishEvent(baseDto, VALID_TRACEPARENT);


      expect(result).toMatchObject({
        eventCategory: "EncounterEvent",
        eventType: "damage_applied",
        version: 1,
        aggregateId: baseDto.aggregateId,
        source: expect.objectContaining({ traceId: "a".repeat(32) }),
      });
      expect(result.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(bus.publish).toHaveBeenCalledTimes(1);
    });

    it("rejeita header traceparent malformado com TRACE_ID_INVALID", async () => {
      const bus = makeBus();
      const ctrl = new EventBusController(
        bus,
        makeAudienceMap(),
        makeFactory(),
      );

      await expect(
        ctrl.publishEvent(baseDto, "00-shortid-bad-99"),
      ).rejects.toMatchObject({ code: ErrorCode.TRACE_ID_INVALID });
      await expect(
        ctrl.publishEvent(baseDto, "00-shortid-bad-99"),
      ).rejects.toBeInstanceOf(DomainException);
      expect(bus.publish).not.toHaveBeenCalled();
    });

    it("rejeita source.traceId malformado quando sem header", async () => {
      const bus = makeBus();
      const ctrl = new EventBusController(
        bus,
        makeAudienceMap(),
        makeFactory(),
      );
      const dto: PublishEventDto = {
        ...baseDto,
        source: { ...baseDto.source, traceId: "zzzz" },
      };
      await expect(ctrl.publishEvent(dto, undefined)).rejects.toMatchObject({
        code: ErrorCode.TRACE_ID_INVALID,
      });
    });

    it("propaga rejeição do bus quando eventType fora do catálogo", async () => {
      const bus = makeBus();
      (bus.publish as jest.Mock).mockRejectedValue(
        new DomainException(
          ErrorCode.EVENT_TYPE_NOT_REGISTERED,
          "type not registered",
        ),
      );
      const ctrl = new EventBusController(
        bus,
        makeAudienceMap(),
        makeFactory(),
      );

      await expect(
        ctrl.publishEvent(
          { ...baseDto, eventType: "something_made_up" },
          VALID_TRACEPARENT,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.EVENT_TYPE_NOT_REGISTERED,
      });
    });

    it("envelope montado herda traceId do header sobre body source", async () => {
      const bus = makeBus();
      const factory = makeFactory();
      const ctrl = new EventBusController(bus, makeAudienceMap(), factory);

      const headerTrace = "c".repeat(32);
      const tp = `00-${headerTrace}-${"d".repeat(16)}-01`;
      await ctrl.publishEvent(
        {
          ...baseDto,
          source: { ...baseDto.source, traceId: "f".repeat(32) },
        },
        tp,
      );
      const passed = (bus.publish as jest.Mock).mock.calls[0][0];
      expect(passed.source.traceId).toBe(headerTrace);
    });
  });

  describe("GET /campaigns/:id/audience-map", () => {
    it("retorna entries via AudienceMapService.getCampaignMap", async () => {
      const bus = makeBus();
      const audienceMap = makeAudienceMap();
      (audienceMap.getCampaignMap as jest.Mock).mockResolvedValue([
        {
          eventCategory: "EncounterEvent",
          eventType: "damage_applied",
          defaultAudiences: ["CombatAgent", "Narrator", "HUD"],
          audiences: ["HUD"],
          overrideable: true,
          hasOverride: true,
          subChannel: "hp-bar",
        },
      ]);
      const ctrl = new EventBusController(bus, audienceMap, makeFactory());

      const result = await ctrl.getAudienceMap(
        "11111111-1111-1111-1111-111111111111",
      );

      expect(result.campaignId).toBe("11111111-1111-1111-1111-111111111111");
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].audiences).toEqual(["HUD"]);
      expect(audienceMap.getCampaignMap).toHaveBeenCalledWith(
        "11111111-1111-1111-1111-111111111111",
      );
    });
  });
});
