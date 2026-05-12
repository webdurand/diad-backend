import { NotFoundException } from "@nestjs/common";
import { CompanionTemplateService } from "../companion-template.service";

describe("CompanionTemplateService", () => {
  function makeRepo() {
    return {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve({ id: "saved", ...value })),
      delete: jest.fn(),
    };
  }

  function makeAiProxy() {
    return {
      postJsonToAgent: jest.fn(),
    };
  }

  it("lists campaign templates ordered for the world creator", async () => {
    const repo = makeRepo();
    repo.find.mockResolvedValueOnce([]);
    const service = new CompanionTemplateService(repo as any, makeAiProxy() as any);

    await expect(service.list("campaign-1")).resolves.toEqual([]);
    expect(repo.find).toHaveBeenCalledWith({
      where: { campaignId: "campaign-1" },
      order: { displayOrder: "ASC", name: "ASC" },
    });
  });

  it("creates a template with campaign id and generated slug", async () => {
    const repo = makeRepo();
    const service = new CompanionTemplateService(repo as any, makeAiProxy() as any);

    const result = await service.create("campaign-1", {
      name: "Shadow Knife",
      race: "Human",
      personalityBig5: {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5,
      },
      dialogueStyle: "Seco e direto.",
      voiceNotes: "Fala baixo.",
      motivation: "Pagar uma divida antiga.",
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "campaign-1",
        name: "Shadow Knife",
        slug: "shadow-knife",
        displayOrder: 0,
      }),
    );
    expect(result.id).toBe("saved");
  });

  it("throws when updating a template from another campaign", async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValueOnce(null);
    const service = new CompanionTemplateService(repo as any, makeAiProxy() as any);

    await expect(
      service.update("campaign-1", "template-1", { name: "New Name" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("forges a companion template through agents and persists the structured profile", async () => {
    const repo = makeRepo();
    const aiProxy = makeAiProxy();
    aiProxy.postJsonToAgent.mockResolvedValueOnce({
      personalityBig5: {
        openness: 0.7,
        conscientiousness: 0.4,
        extraversion: 0.2,
        agreeableness: 0.35,
        neuroticism: 0.8,
      },
      dialogueStyle: "Sarcastica, curta, com humor seco.",
      voiceNotes: "Frases quebradas; evita sentimentalismo direto.",
      motivation: "Quitar a divida que deixou uma vila inteira em ruinas.",
      companionProfile: {
        coreWound: "Acredita que toda lealdade cobra juros.",
        signaturePhrases: ["Claro. Porque confiar deu tao certo."],
      },
      suggestedBuild: {
        className: "Rogue",
        levelSync: "match_owner",
      },
    });
    const service = new CompanionTemplateService(repo as any, aiProxy as any);

    const result = await service.forge(
      "campaign-1",
      {
        name: "Nyra",
        race: "Elf",
        portraitUrl: "https://example.test/nyra.png",
        personaSummary: "Uma ladina sarcastica assombrada por uma divida antiga.",
        suggestedClassHint: "Rogue",
        introductionHook: { locationId: "loc-1", expiresAfterRecruitment: true },
      },
      "user-1",
    );

    expect(aiProxy.postJsonToAgent).toHaveBeenCalledWith(
      "/companion-forge",
      expect.objectContaining({
        campaignId: "campaign-1",
        name: "Nyra",
        race: "Elf",
        personaSummary: expect.any(String),
      }),
      { timeoutMs: 45000, userId: "user-1" },
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "campaign-1",
        name: "Nyra",
        race: "Elf",
        slug: "nyra",
        portraitUrl: "https://example.test/nyra.png",
        companionProfile: expect.objectContaining({
          coreWound: "Acredita que toda lealdade cobra juros.",
        }),
        suggestedBuild: expect.objectContaining({ className: "Rogue" }),
      }),
    );
    expect(result.id).toBe("saved");
  });
});
