import { ForbiddenException } from "@nestjs/common";
import { PermissionResolver } from "../services/permission-resolver.service";

function mockServices(
  participant: any,
  encounter: any,
  session: any,
  campaignDmUserId?: string,




  multiplayerHumanCount: number = 2,
) {
  const participantById = new Map<string, any>();
  participantById.set(participant.id, participant);
  if (participant.__linkedCaster) {
    participantById.set(participant.__linkedCaster.id, participant.__linkedCaster);
  }
  const encounterService: any = {
    getParticipant: jest.fn(async (id: string) => participantById.get(id)),
    getById: jest.fn(async () => encounter),
    resolveCharacterOwner: jest.fn(
      async (_cid: string, fallback: string) =>
        participant.__ownerByCharacterId?.[_cid] ??
        participant.__ownerUserId ??
        fallback,
    ),
  };
  const sessionService: any = {
    getById: jest.fn(async () => session),
  };
  const campaignService: any = {
    getById: jest.fn(async () =>
      campaignDmUserId
        ? { id: session.campaignId, dmUserId: campaignDmUserId }
        : { id: session.campaignId, dmUserId: "someone-else" },
    ),
  };


  const campaignPlayerRepo: any = {
    count: jest.fn(async () => multiplayerHumanCount),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({ n: String(multiplayerHumanCount) })),
    })),
  };
  return {
    encounterService,
    sessionService,
    campaignService,
    campaignPlayerRepo,
  };
}

describe("PermissionResolver", () => {
  const encounter = { id: "enc-1", sessionId: "sess-1" };
  const session = { id: "sess-1", campaignId: "camp-1" };

  it("allows the PC owner to mutate their own participant", async () => {
    const participant = {
      id: "p-1",
      type: "pc",
      characterId: "char-1",
      encounterId: "enc-1",
      __ownerUserId: "user-owner",
    };
    const {
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    } = mockServices(participant, encounter, session);
    const resolver = new PermissionResolver(
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    );

    const result = await resolver.resolveMutationOwner(
      "p-1",
      "user-owner",
      "enc-1",
    );
    expect(result).toBe("user-owner");
  });

  it("allows the campaign DM to mutate a PC owned by someone else", async () => {
    const participant = {
      id: "p-2",
      type: "pc",
      characterId: "char-2",
      encounterId: "enc-1",
      __ownerUserId: "user-other",
    };
    const {
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    } = mockServices(participant, encounter, session, "user-dm");
    const resolver = new PermissionResolver(
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    );

    const result = await resolver.resolveMutationOwner(
      "p-2",
      "user-dm",
      "enc-1",
    );
    expect(result).toBe("user-other");
  });

  it("rejects a random user that is neither owner nor DM", async () => {
    const participant = {
      id: "p-3",
      type: "pc",
      characterId: "char-3",
      encounterId: "enc-1",
      __ownerUserId: "user-other",
    };
    const {
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    } = mockServices(participant, encounter, session, "user-dm");
    const resolver = new PermissionResolver(
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    );

    await expect(
      resolver.resolveMutationOwner("p-3", "user-outsider", "enc-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows the DM to mutate a monster participant", async () => {
    const participant = {
      id: "m-1",
      type: "monster",
      monsterId: "mon-1",
      encounterId: "enc-1",
    };
    const {
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    } = mockServices(participant, encounter, session, "user-dm");
    const resolver = new PermissionResolver(
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    );

    const result = await resolver.resolveMutationOwner(
      "m-1",
      "user-dm",
      "enc-1",
    );
    expect(result).toBe("user-dm");
  });

  it("rejects a non-DM user trying to mutate a monster", async () => {
    const participant = {
      id: "m-2",
      type: "monster",
      monsterId: "mon-2",
      encounterId: "enc-1",
    };
    const {
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    } = mockServices(participant, encounter, session, "user-dm");
    const resolver = new PermissionResolver(
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    );

    await expect(
      resolver.resolveMutationOwner("m-2", "user-other", "enc-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows PC owner to mutate a summon linked to their caster", async () => {
    const participant = {
      id: "summon-1",
      type: "monster",
      monsterId: "mon-1",
      encounterId: "enc-1",
      controlledBy: "pc",
      linkedCasterParticipantId: "caster-1",
      __linkedCaster: {
        id: "caster-1",
        type: "pc",
        characterId: "char-caster",
        encounterId: "enc-1",
      },
      __ownerByCharacterId: {
        "char-caster": "user-owner",
      },
    };
    const {
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    } = mockServices(participant, encounter, session);
    const resolver = new PermissionResolver(
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    );

    const result = await resolver.resolveMutationOwner(
      "summon-1",
      "user-owner",
      "enc-1",
    );
    expect(result).toBe("user-owner");
  });

  it("rejects a non-owner trying to mutate a PC-controlled summon", async () => {
    const participant = {
      id: "summon-1",
      type: "monster",
      monsterId: "mon-1",
      encounterId: "enc-1",
      controlledBy: "pc",
      linkedCasterParticipantId: "caster-1",
      __linkedCaster: {
        id: "caster-1",
        type: "pc",
        characterId: "char-caster",
        encounterId: "enc-1",
      },
      __ownerByCharacterId: {
        "char-caster": "user-owner",
      },
    };
    const {
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    } = mockServices(participant, encounter, session);
    const resolver = new PermissionResolver(
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    );

    await expect(
      resolver.resolveMutationOwner("summon-1", "user-other", "enc-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects when participant belongs to a different encounter", async () => {
    const participant = {
      id: "p-4",
      type: "pc",
      characterId: "char-4",
      encounterId: "other-enc",
      __ownerUserId: "user-owner",
    };
    const {
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    } = mockServices(participant, encounter, session);
    const resolver = new PermissionResolver(
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    );

    await expect(
      resolver.resolveMutationOwner("p-4", "user-owner", "enc-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects when auth user id is missing", async () => {
    const participant = {
      id: "p-5",
      type: "pc",
      characterId: "char-5",
      encounterId: "enc-1",
    };
    const {
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    } = mockServices(participant, encounter, session);
    const resolver = new PermissionResolver(
      encounterService,
      sessionService,
      campaignService,
      campaignPlayerRepo,
    );

    await expect(
      resolver.resolveMutationOwner("p-5", "", "enc-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
