import { ClsService } from "nestjs-cls";
import { EventEnvelopeFactory } from "../event-envelope.factory";
import { TRACE_ID_REGEX } from "../event-envelope.types";

function makeCls(values: Record<string, string> = {}): ClsService {
  return {
    isActive: () => true,
    get: (key: string) => values[key],
  } as unknown as ClsService;
}

function inactiveCls(): ClsService {
  return {
    isActive: () => false,
    get: () => undefined,
  } as unknown as ClsService;
}

describe("EventEnvelopeFactory", () => {
  const baseInput = {
    eventCategory: "EncounterEvent" as const,
    eventType: "damage_applied",
    source: {
      service: "diad-backend" as const,
      module: "CombatService.applyDamage",
    },
    scope: { campaignId: "11111111-1111-1111-1111-111111111111" },
    payload: { participantId: "x", hpBefore: 30, hpAfter: 12, amount: 18 },
    aggregateId: "33333333-3333-3333-3333-333333333333",
  };

  it("injeta eventId UUID v4 quando ausente", () => {
    const factory = new EventEnvelopeFactory(makeCls());
    const env = factory.build(baseInput);
    expect(env.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("usa eventId provido se presente", () => {
    const factory = new EventEnvelopeFactory(makeCls());
    const fixed = "9f6c7b1a-2d3e-4f5a-8b9c-1d2e3f4a5b6c";
    const env = factory.build({ ...baseInput, eventId: fixed });
    expect(env.eventId).toBe(fixed);
  });

  it("injeta traceId do CLS quando disponível", () => {
    const traceId = "a".repeat(32);
    const factory = new EventEnvelopeFactory(makeCls({ traceId }));
    const env = factory.build(baseInput);
    expect(env.source.traceId).toBe(traceId);
  });

  it("regera traceId W3C (32 hex) quando CLS vazio e source.traceId ausente", () => {
    const factory = new EventEnvelopeFactory(inactiveCls());
    const env = factory.build(baseInput);
    expect(env.source.traceId).toMatch(TRACE_ID_REGEX);
    expect(env.source.traceId).not.toBe("0".repeat(32));
  });

  it("respeita traceId provido em source quando válido", () => {
    const traceId = "b".repeat(32);
    const factory = new EventEnvelopeFactory(
      makeCls({ traceId: "cccccccccccccccccccccccccccccccc" }),
    );
    const env = factory.build({
      ...baseInput,
      source: { ...baseInput.source, traceId },
    });
    expect(env.source.traceId).toBe(traceId);
  });

  it("descarta traceId malformado e cai pra CLS/regen", () => {
    const traceId = "z".repeat(32); // invalid (not hex)
    const factory = new EventEnvelopeFactory(
      makeCls({ traceId: "d".repeat(32) }),
    );
    const env = factory.build({
      ...baseInput,
      source: { ...baseInput.source, traceId },
    });
    expect(env.source.traceId).toBe("d".repeat(32));
  });

  it("timestamp default é ISO-8601 UTC", () => {
    const factory = new EventEnvelopeFactory(makeCls());
    const env = factory.build(baseInput);
    expect(env.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/,
    );
  });

  it("version default = 1; aggregateId é mandatory carry-through", () => {
    const factory = new EventEnvelopeFactory(
      makeCls({ traceId: "e".repeat(32) }),
    );
    const env = factory.build(baseInput);
    expect(env.version).toBe(1);
    expect(env.aggregateId).toBe(baseInput.aggregateId);
  });

  it("version respeitada quando provida", () => {
    const factory = new EventEnvelopeFactory(
      makeCls({ traceId: "f".repeat(32) }),
    );
    const env = factory.build({ ...baseInput, version: 3 });
    expect(env.version).toBe(3);
  });

  it("audiences default vazio quando não provido (Bus resolve depois)", () => {
    const factory = new EventEnvelopeFactory(
      makeCls({ traceId: "1".repeat(32) }),
    );
    const env = factory.build(baseInput);
    expect(env.audiences).toEqual([]);
  });

  it("propaga narrativeDescriptor + metadata quando fornecidos", () => {
    const factory = new EventEnvelopeFactory(
      makeCls({ traceId: "2".repeat(32) }),
    );
    const env = factory.build({
      ...baseInput,
      narrativeDescriptor: "Aelar foi atingido criticamente",
      metadata: { tacticalValue: 7, tags: ["damage", "critical"] },
    });
    expect(env.narrativeDescriptor).toBe("Aelar foi atingido criticamente");
    expect(env.metadata).toEqual({
      tacticalValue: 7,
      tags: ["damage", "critical"],
    });
  });
});
