import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PartiesService } from "../parties.service";

describe("PartiesService", () => {
  function makeRepos() {
    return {
      campaignRepo: {
        findOne: jest.fn(),
      },
      playerRepo: {
        findOne: jest.fn(),
      },
      partyMemberRepo: {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn((value) => value),
        save: jest.fn((value) => Promise.resolve({ id: "member-1", ...value })),
        count: jest.fn(),
      },
      characterRepo: { findOne: jest.fn() },
      templateRepo: { findOne: jest.fn() },
      sessionRepo: { find: jest.fn() },
      sceneRepo: { findOne: jest.fn() },
      locationRepo: { findOne: jest.fn() },
      charStateRepo: { findOne: jest.fn() },
      charClassRepo: { find: jest.fn() },
    };
  }

  function makeCharactersService() {
    return {
      createCompanion: jest.fn(),
    };
  }

  function makeService(
    repos: ReturnType<typeof makeRepos>,
    charactersService = makeCharactersService(),
  ) {
    return new PartiesService(
      repos.partyMemberRepo as any,
      repos.campaignRepo as any,
      repos.playerRepo as any,
      repos.characterRepo as any,
      repos.templateRepo as any,
      repos.sessionRepo as any,
      repos.sceneRepo as any,
      repos.locationRepo as any,
      repos.charStateRepo as any,
      repos.charClassRepo as any,
      charactersService as any,
    );
  }

  it("returns an empty party roster for a campaign member", async () => {
    const repos = makeRepos();
    repos.campaignRepo.findOne.mockResolvedValueOnce({ id: "campaign-1" });
    repos.playerRepo.findOne.mockResolvedValueOnce({ id: "player-1" });
    repos.partyMemberRepo.find.mockResolvedValueOnce([]);
    const service = makeService(repos);

    await expect(
      service.list("campaign-1", "user-1", "owner-character-1"),
    ).resolves.toEqual([]);

    expect(repos.partyMemberRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          campaignId: "campaign-1",
          ownerCharacterId: "owner-character-1",
        }),
      }),
    );
  });

  it("resolves campaign slugs before listing party members", async () => {
    const repos = makeRepos();
    repos.campaignRepo.findOne.mockResolvedValueOnce({ id: "campaign-1" });
    repos.playerRepo.findOne.mockResolvedValueOnce({ id: "player-1" });
    repos.partyMemberRepo.find.mockResolvedValueOnce([]);
    const service = makeService(repos);

    await service.list("lost-mine", "user-1");

    expect(repos.campaignRepo.findOne).toHaveBeenCalledWith({
      where: { slug: "lost-mine" },
      select: { id: true },
    });
  });

  it("throws when requester is not a campaign member", async () => {
    const repos = makeRepos();
    repos.campaignRepo.findOne.mockResolvedValueOnce({ id: "campaign-1" });
    repos.playerRepo.findOne.mockResolvedValueOnce(null);
    const service = makeService(repos);

    await expect(service.list("campaign-1", "user-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("invites a forged template by creating a companion character in roster", async () => {
    const repos = makeRepos();
    const charactersService = makeCharactersService();
    repos.campaignRepo.findOne.mockResolvedValueOnce({ id: "campaign-1" });
    repos.playerRepo.findOne.mockResolvedValueOnce({ id: "player-1" });
    repos.characterRepo.findOne.mockResolvedValueOnce({
      id: "owner-1",
      userId: "user-1",
      ownerType: "pc",
    });
    repos.templateRepo.findOne.mockResolvedValueOnce({
      id: "template-1",
      campaignId: "campaign-1",
      name: "Nyra",
      suggestedBuild: { classSlug: "rogue" },
    });
    charactersService.createCompanion.mockResolvedValueOnce({
      id: "companion-1",
      userId: "user-1",
      ownerType: "companion",
    });
    const service = makeService(repos, charactersService);

    const result = await service.invite("campaign-1", "user-1", {
      ownerCharacterId: "owner-1",
      templateId: "template-1",
      build: { data: { classSlug: "rogue" } },
    });

    expect(charactersService.createCompanion).toHaveBeenCalledWith(
      expect.objectContaining({ id: "template-1" }),
      { data: { classSlug: "rogue" } },
      expect.objectContaining({ id: "owner-1" }),
    );
    expect(repos.partyMemberRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "campaign-1",
        ownerCharacterId: "owner-1",
        companionCharacterId: "companion-1",
        companionTemplateId: "template-1",
        state: "roster",
      }),
    );
    expect(result.id).toBe("member-1");
  });

  it("blocks activation outside safe zones", async () => {
    const repos = makeRepos();
    repos.campaignRepo.findOne.mockResolvedValueOnce({ id: "campaign-1" });
    repos.playerRepo.findOne.mockResolvedValueOnce({ id: "player-1" });
    repos.partyMemberRepo.findOne.mockResolvedValueOnce({
      id: "member-1",
      campaignId: "campaign-1",
      ownerCharacterId: "owner-1",
      companionCharacterId: "companion-1",
      state: "roster",
    });
    repos.characterRepo.findOne.mockResolvedValueOnce({ id: "owner-1" });
    repos.sessionRepo.find.mockResolvedValueOnce([{ id: "session-1" }]);
    repos.sceneRepo.findOne.mockResolvedValueOnce({
      id: "scene-1",
      locationId: "loc-1",
    });
    repos.locationRepo.findOne.mockResolvedValueOnce({
      id: "loc-1",
      tags: ["danger"],
      properties: {},
    });
    const service = makeService(repos);

    await expect(
      service.activate("campaign-1", "user-1", "companion-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks activation when two companions are already active", async () => {
    const repos = makeRepos();
    repos.campaignRepo.findOne.mockResolvedValueOnce({ id: "campaign-1" });
    repos.playerRepo.findOne.mockResolvedValueOnce({ id: "player-1" });
    repos.partyMemberRepo.findOne.mockResolvedValueOnce({
      id: "member-1",
      campaignId: "campaign-1",
      ownerCharacterId: "owner-1",
      companionCharacterId: "companion-1",
      state: "roster",
    });
    repos.characterRepo.findOne.mockResolvedValueOnce({ id: "owner-1" });
    repos.sessionRepo.find.mockResolvedValueOnce([{ id: "session-1" }]);
    repos.sceneRepo.findOne.mockResolvedValueOnce({
      id: "scene-1",
      locationId: "loc-1",
    });
    repos.locationRepo.findOne.mockResolvedValueOnce({
      id: "loc-1",
      tags: ["safe_zone"],
      properties: {},
    });
    repos.partyMemberRepo.count.mockResolvedValueOnce(2);
    const service = makeService(repos);

    await expect(
      service.activate("campaign-1", "user-1", "companion-1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
