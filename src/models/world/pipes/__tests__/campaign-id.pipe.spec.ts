
import { NotFoundException } from "@nestjs/common";
import { CampaignIdPipe } from "../campaign-id.pipe";
import type { CampaignService } from "../../services/campaign.service";

describe("CampaignIdPipe", () => {
  function makePipe(resolveId: (v: string) => Promise<string>) {
    const svc = { resolveId } as unknown as CampaignService;
    return new CampaignIdPipe(svc);
  }

  it("delega resolução pro CampaignService.resolveId", async () => {
    const calls: string[] = [];
    const pipe = makePipe(async (v) => {
      calls.push(v);
      return "11111111-1111-4111-8111-111111111111";
    });

    const out = await pipe.transform("misterio-aldeia-campaign");

    expect(out).toBe("11111111-1111-4111-8111-111111111111");
    expect(calls).toEqual(["misterio-aldeia-campaign"]);
  });

  it("repassa UUID resolvido quando service confirma existência", async () => {
    const uuid = "22222222-2222-4222-8222-222222222222";
    const pipe = makePipe(async (v) => v);

    const out = await pipe.transform(uuid);

    expect(out).toBe(uuid);
  });

  it("propaga NotFoundException quando service não acha", async () => {
    const pipe = makePipe(async () => {
      throw new NotFoundException("Campanha nao encontrada.");
    });

    await expect(pipe.transform("slug-inexistente")).rejects.toThrow(
      NotFoundException,
    );
  });
});
