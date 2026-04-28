import { Repository } from "typeorm";
import { LootTableEntity } from "src/entities/loot-table.entity";
import { LootRollService } from "../loot-roll.service";
import { LootService } from "../loot.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const TABLE_ID = "22222222-2222-4222-8222-222222222222";

function makeTableRepo(
  table: Partial<LootTableEntity> | null,
): Repository<LootTableEntity> {
  return {
    findOne: jest.fn(async () => table as LootTableEntity | null),
  } as unknown as Repository<LootTableEntity>;
}

function makeLootService(): LootService {
  return {
    rollLoot: jest.fn(async (id: string) => ({
      ok: true,
      value: {
        lootTableId: id,
        lootTableName: "test",
        items: [{ name: "Adaga +1", quantity: 1 }],
      },
      events: [],
    })),
  } as unknown as LootService;
}

function makeBus(): EventBusService {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
  } as unknown as EventBusService;
}

describe("LootRollService — Spec 020", () => {
  it("rola por table_slug e marca como saqueada", async () => {
    const bus = makeBus();
    const svc = new LootRollService(
      makeTableRepo({
        id: TABLE_ID,
        name: "dungeon-low",
        isLooted: false,
      }),
      makeLootService(),
      bus,
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.roll({
      campaignId: CAMPAIGN_ID,
      tableSlug: "dungeon-low",
    });
    expect(result.lootTableId).toBe(TABLE_ID);
    expect(result.items).toHaveLength(1);
    expect(bus.publish).toHaveBeenCalled();
  });

  it("rejeita table já saqueada (LOOT_ALREADY_ROLLED)", async () => {
    const svc = new LootRollService(
      makeTableRepo({
        id: TABLE_ID,
        name: "dungeon-low",
        isLooted: true,
      }),
      makeLootService(),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    await expect(
      svc.roll({ campaignId: CAMPAIGN_ID, tableSlug: "dungeon-low" }),
    ).rejects.toMatchObject({ code: ErrorCode.LOOT_ALREADY_ROLLED });
  });

  it("rejeita slug inexistente (LOOT_TABLE_NOT_FOUND)", async () => {
    const svc = new LootRollService(
      makeTableRepo(null),
      makeLootService(),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    await expect(
      svc.roll({ campaignId: CAMPAIGN_ID, tableSlug: "nope" }),
    ).rejects.toMatchObject({ code: ErrorCode.LOOT_TABLE_NOT_FOUND });
  });

  it("rejeita LOOT_PARAMS_INVALID quando nenhum modo informado", async () => {
    const svc = new LootRollService(
      makeTableRepo(null),
      makeLootService(),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    await expect(
      svc.roll({ campaignId: CAMPAIGN_ID }),
    ).rejects.toMatchObject({ code: ErrorCode.LOOT_PARAMS_INVALID });
  });

  it("rejeita LOOT_PARAMS_INVALID quando 2+ modos informados", async () => {
    const svc = new LootRollService(
      makeTableRepo(null),
      makeLootService(),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    await expect(
      svc.roll({
        campaignId: CAMPAIGN_ID,
        tableSlug: "x",
        crBand: "cr_0_4",
      }),
    ).rejects.toMatchObject({ code: ErrorCode.LOOT_PARAMS_INVALID });
  });

  it("cr_band ad-hoc retorna currency dentro da banda", async () => {
    const svc = new LootRollService(
      makeTableRepo(null),
      makeLootService(),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.roll({
      campaignId: CAMPAIGN_ID,
      crBand: "cr_0_4",
      hoardOrIndividual: "individual",
    });
    expect(result.lootTableId).toBeNull();
    expect(result.currency.gp).toBeGreaterThanOrEqual(0);
    expect(result.currency.gp).toBeLessThanOrEqual(50);
  });

  it("hoard mode multiplica currency 5x sobre individual", async () => {
    const svc = new LootRollService(
      makeTableRepo(null),
      makeLootService(),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.roll({
      campaignId: CAMPAIGN_ID,
      crBand: "cr_5_10",
      hoardOrIndividual: "hoard",
    });
    expect(result.currency.gp).toBeGreaterThanOrEqual(50 * 5);
    expect(result.currency.gp).toBeLessThanOrEqual(500 * 5);
  });

  it("monster_slug retorna MONSTER_HAS_NO_LOOT (V1 sem mapping canônico)", async () => {
    const svc = new LootRollService(
      makeTableRepo(null),
      makeLootService(),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    await expect(
      svc.roll({ campaignId: CAMPAIGN_ID, monsterSlug: "goblin" }),
    ).rejects.toMatchObject({ code: ErrorCode.MONSTER_HAS_NO_LOOT });
  });

  it("awarded=true quando award_to_character_id informado", async () => {
    const svc = new LootRollService(
      makeTableRepo({
        id: TABLE_ID,
        name: "x",
        isLooted: false,
      }),
      makeLootService(),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );
    const result = await svc.roll({
      campaignId: CAMPAIGN_ID,
      tableSlug: "x",
      awardToCharacterId: "char-uuid",
    });
    expect(result.awarded).toBe(true);
  });
});
