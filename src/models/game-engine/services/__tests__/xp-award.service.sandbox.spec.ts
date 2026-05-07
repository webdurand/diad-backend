import { XpAwardService } from "../xp-award.service";
import type { CampaignEntity } from "src/entities/campaign.entity";

const CHAR_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const SANDBOX_CAMP_ID = "11111111-1111-4111-8111-111111111111";
const REGULAR_CAMP_ID = "22222222-2222-4222-8222-222222222222";

function makeService(campaign: Partial<CampaignEntity> | null) {
  const stateRepo = {} as never;
  const campaignRepo = {
    findOne: jest.fn(async () => campaign as CampaignEntity | null),
  };
  const xpEventRepo = {
    create: jest.fn((data: any) => data),
    save: jest.fn(async (entity: any) => ({ id: "evt-1", ...entity })),
  };
  const characterStateService = {
    updateXp: jest.fn(async () => ({
      xp: 100,
      nextLevelXp: 300,
      levelUpAvailable: false,
    })),
  } as never;

  const svc = new XpAwardService(
    stateRepo,
    campaignRepo as never,
    xpEventRepo as never,
    characterStateService,
  );
  return { svc, campaignRepo, xpEventRepo };
}

describe("XpAwardService — sandbox skip", () => {
  it("retorna 0 XP e não persiste evento quando campaign isSandbox=true", async () => {
    const { svc, xpEventRepo } = makeService({
      id: SANDBOX_CAMP_ID,
      isSandbox: true,
    });

    const result = await svc.awardXp({
      characterId: CHAR_ID,
      amount: 250,
      source: "combat_kill",
      reason: "kill goblin",
      ownerUserId: USER_ID,
      campaignId: SANDBOX_CAMP_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.awardedXp).toBe(0);
    expect(result.value.eventId).toBe("sandbox-skip");
    expect(xpEventRepo.save).not.toHaveBeenCalled();
  });

  it("aplica XP normalmente quando campaign isSandbox=false", async () => {
    const { svc, xpEventRepo } = makeService({
      id: REGULAR_CAMP_ID,
      isSandbox: false,
    });

    const result = await svc.awardXp({
      characterId: CHAR_ID,
      amount: 250,
      source: "combat_kill",
      reason: "kill goblin",
      ownerUserId: USER_ID,
      campaignId: REGULAR_CAMP_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.awardedXp).toBe(250);
    expect(xpEventRepo.save).toHaveBeenCalled();
  });

  it("aplica XP normalmente quando não há campaignId", async () => {
    const { svc, xpEventRepo } = makeService(null);

    const result = await svc.awardXp({
      characterId: CHAR_ID,
      amount: 100,
      source: "combat_kill",
      reason: "kill",
      ownerUserId: USER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.awardedXp).toBe(100);
    expect(xpEventRepo.save).toHaveBeenCalled();
  });
});
