import { CampaignService } from "../campaign.service";
import type { CampaignEntity } from "src/entities/campaign.entity";
import type { CampaignPlayerEntity } from "src/entities/campaign-player.entity";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const REGULAR_ID = "11111111-1111-4111-8111-111111111111";
const SANDBOX_ID = "22222222-2222-4222-8222-222222222222";

function makeService(players: Array<Partial<CampaignPlayerEntity>>) {
  const repo = { findOne: jest.fn() };
  const playerRepo = {
    find: jest.fn(async () => players as CampaignPlayerEntity[]),
  };
  return new CampaignService(repo as never, playerRepo as never);
}

describe("CampaignService.listByUser — sandbox exclusion", () => {
  it("exclui campanha sandbox da listagem regular", async () => {
    const regular = {
      id: REGULAR_ID,
      isSandbox: false,
      name: "Campanha real",
    } as CampaignEntity;
    const sandbox = {
      id: SANDBOX_ID,
      isSandbox: true,
      name: "Quick Play Sandbox",
    } as CampaignEntity;

    const svc = makeService([
      {
        campaignId: REGULAR_ID,
        userId: USER_ID,
        isActive: true,
        campaign: regular,
      },
      {
        campaignId: SANDBOX_ID,
        userId: USER_ID,
        isActive: true,
        campaign: sandbox,
      },
    ]);

    const result = await svc.listByUser(USER_ID);
    const ids = result.map((c) => c.id);
    expect(ids).toContain(REGULAR_ID);
    expect(ids).not.toContain(SANDBOX_ID);
  });

  it("retorna array vazio quando user só tem sandbox", async () => {
    const sandbox = {
      id: SANDBOX_ID,
      isSandbox: true,
    } as CampaignEntity;

    const svc = makeService([
      {
        campaignId: SANDBOX_ID,
        userId: USER_ID,
        isActive: true,
        campaign: sandbox,
      },
    ]);

    const result = await svc.listByUser(USER_ID);
    expect(result).toHaveLength(0);
  });

  it("filtra entries sem campaign relacional carregada (boundary)", async () => {
    const svc = makeService([
      {
        campaignId: REGULAR_ID,
        userId: USER_ID,
        isActive: true,
        campaign: undefined,
      },
    ]);

    const result = await svc.listByUser(USER_ID);
    expect(result).toHaveLength(0);
  });
});
