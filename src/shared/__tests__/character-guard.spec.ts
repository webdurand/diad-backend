import { ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  ensureCharacterReadAccess,
  ensureCharacterWriteAccess,
} from "../character-guard";

describe("character guard companion access", () => {
  function makeRepos() {
    return {
      characterRepo: { findOne: jest.fn() },
      partyRepo: { findOne: jest.fn() },
    };
  }

  it("allows reading a roster companion owned by the requester", async () => {
    const repos = makeRepos();
    repos.characterRepo.findOne.mockResolvedValueOnce({
      id: "companion-1",
      userId: "user-1",
      ownerType: "companion",
    });
    repos.partyRepo.findOne.mockResolvedValueOnce({
      companionCharacterId: "companion-1",
      state: "roster",
    });

    await expect(
      ensureCharacterReadAccess(
        repos.characterRepo as any,
        "user-1",
        "companion-1",
        repos.partyRepo as any,
      ),
    ).resolves.toMatchObject({ id: "companion-1" });
  });

  it("blocks writing a roster companion", async () => {
    const repos = makeRepos();
    repos.characterRepo.findOne.mockResolvedValueOnce({
      id: "companion-1",
      userId: "user-1",
      ownerType: "companion",
    });
    repos.partyRepo.findOne.mockResolvedValueOnce({
      companionCharacterId: "companion-1",
      state: "roster",
    });

    await expect(
      ensureCharacterWriteAccess(
        repos.characterRepo as any,
        "user-1",
        "companion-1",
        repos.partyRepo as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps missing or foreign characters hidden", async () => {
    const repos = makeRepos();
    repos.characterRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      ensureCharacterReadAccess(
        repos.characterRepo as any,
        "user-1",
        "missing",
        repos.partyRepo as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
