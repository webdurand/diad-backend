
import { UnprocessableEntityException } from "@nestjs/common";
import { NarrativeDecisionService } from "../narrative-decision.service";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import type { CreateNarrativeDecisionDto } from "../narrative-decision.service";

describe("NarrativeDecisionService.create — D2 name→UUID resolution", () => {
  const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
  const NPC_UUID = "22222222-2222-4222-8222-222222222222";
  const LOCATION_UUID = "33333333-3333-4333-8333-333333333333";

  function makeService(
    opts: {
      npcByName?: Record<string, { id: string; name: string }>;
      locationByName?: Record<string, { id: string; name: string }>;
    } = {},
  ) {
    const saved: unknown[] = [];
    const repo = {
      create: jest.fn((entity: unknown) => entity),
      save: jest.fn(async (entity: unknown) => {
        saved.push(entity);
        return { ...(entity as object), id: "saved-id" };
      }),
    } as never;
    const eventLog = { logEvent: jest.fn().mockResolvedValue(undefined) };
    const STUB_ID = "stub-npc-id";
    const npcService = {
      findByNameInSession: jest.fn(
        async (_sId: string, name: string) =>
          opts.npcByName?.[name.toLowerCase()] ?? null,
      ),
      materializeStubFromName: jest.fn(async (_sId: string, name: string) => ({
        id: STUB_ID,
        name,
      })),
    };
    const locationService = {
      findByNameInCampaign: jest.fn(
        async (_cId: string, name: string) =>
          opts.locationByName?.[name.toLowerCase()] ?? null,
      ),
    };
    const sessionRepo = {
      findOne: jest.fn(async () => ({
        id: "session-id",
        campaignId: CAMPAIGN_ID,
      })),
    } as never;

    const svc = new NarrativeDecisionService(
      repo,
      sessionRepo,
      eventLog as never,
      npcService as never,
      locationService as never,
    );
    return { svc, saved, npcService, locationService };
  }

  function baseDto(): CreateNarrativeDecisionDto {
    return {
      decisionText: "Goma atacou Eda em plena luz do dia.",
      tags: ["violence"],
      impactWeight: 8,
    };
  }

  it("aceita affectedEntityId como UUID (passthrough)", async () => {
    const { svc, saved } = makeService();
    await svc.create(CAMPAIGN_ID, {
      ...baseDto(),
      affectedEntityType: "npc",
      affectedEntityId: NPC_UUID,
    });
    expect((saved[0] as { affectedEntityId: string }).affectedEntityId).toBe(
      NPC_UUID,
    );
  });

  it("resolve nome de NPC para UUID antes de persistir (D2 fix)", async () => {
    const { svc, saved, npcService } = makeService({
      npcByName: { eda: { id: NPC_UUID, name: "Eda" } },
    });
    await svc.create(CAMPAIGN_ID, {
      ...baseDto(),
      affectedEntityType: "npc",
      affectedEntityId: "eda",
    });
    expect(npcService.findByNameInSession).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      "eda",
    );
    expect((saved[0] as { affectedEntityId: string }).affectedEntityId).toBe(
      NPC_UUID,
    );
  });

  it("resolve nome de location para UUID", async () => {
    const { svc, saved, locationService } = makeService({
      locationByName: { taverna: { id: LOCATION_UUID, name: "Taverna" } },
    });
    await svc.create(CAMPAIGN_ID, {
      ...baseDto(),
      affectedEntityType: "location",
      affectedEntityId: "Taverna",
    });
    expect(locationService.findByNameInCampaign).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      "Taverna",
    );
    expect((saved[0] as { affectedEntityId: string }).affectedEntityId).toBe(
      LOCATION_UUID,
    );
  });

  it("auto-materializa stub quando nome de NPC não casa com nenhum canônico", async () => {
    const { svc, saved, npcService } = makeService({

      npcByName: {},
    });
    await svc.create(CAMPAIGN_ID, {
      ...baseDto(),
      affectedEntityType: "npc",
      affectedEntityId: "eda",
    });
    expect(npcService.materializeStubFromName).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      "eda",
    );
    expect((saved[0] as { affectedEntityId: string }).affectedEntityId).toBe(
      "stub-npc-id",
    );
  });

  it("422 quando vem nome sem entityType (não-resolvível)", async () => {
    const { svc } = makeService();
    await expect(
      svc.create(CAMPAIGN_ID, {
        ...baseDto(),
        affectedEntityType: undefined,
        affectedEntityId: "eda",
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("422 quando type='item' (resolver não suportado ainda) e entityId é nome", async () => {
    const { svc } = makeService();
    await expect(
      svc.create(CAMPAIGN_ID, {
        ...baseDto(),
        affectedEntityType: "item",
        affectedEntityId: "espada longa",
      }),
    ).rejects.toMatchObject({
      response: {
        code: ErrorCode.NARRATIVE_DECISION_AFFECTED_ENTITY_NOT_FOUND,
      },
    });
  });

  it("aceita type='item' com UUID válido (passthrough sem resolver)", async () => {
    const { svc, saved } = makeService();
    const itemUuid = "44444444-4444-4444-8444-444444444444";
    await svc.create(CAMPAIGN_ID, {
      ...baseDto(),
      affectedEntityType: "item",
      affectedEntityId: itemUuid,
    });
    expect((saved[0] as { affectedEntityId: string }).affectedEntityId).toBe(
      itemUuid,
    );
  });

  it("aceita decision sem affectedEntityId (campo opcional)", async () => {
    const { svc, saved } = makeService();
    await svc.create(CAMPAIGN_ID, {
      ...baseDto(),

    });
    expect(
      (saved[0] as { affectedEntityId?: string }).affectedEntityId,
    ).toBeUndefined();
  });

  it("trim espaços em torno do nome", async () => {
    const { svc, saved } = makeService({
      npcByName: { eda: { id: NPC_UUID, name: "Eda" } },
    });
    await svc.create(CAMPAIGN_ID, {
      ...baseDto(),
      affectedEntityType: "npc",
      affectedEntityId: "  eda  ",
    });
    expect((saved[0] as { affectedEntityId: string }).affectedEntityId).toBe(
      NPC_UUID,
    );
  });
});
