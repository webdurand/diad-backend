import { ConflictException } from "@nestjs/common";
import { CharactersController } from "../characters.controller";

const CHARACTER_ID = "83206045-8490-43fd-a9a6-fedf3eb43329";
const ENCOUNTER_ID = "encounter-1";
const PARTICIPANT_ID = "participant-pc";
const USER_ID = "user-1";

function makeQueryBuilder(isSessionActiveEncounter: boolean) {
  const clauses: string[] = [];
  const encounter = {
    id: ENCOUNTER_ID,
    status: "active",
    currentTurnIndex: 0,
    turnOrder: [PARTICIPANT_ID],
  };

  const qb = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn((clause: string) => {
      clauses.push(clause);
      return qb;
    }),
    andWhere: jest.fn((clause: string) => {
      clauses.push(clause);
      return qb;
    }),
    getMany: jest.fn(async () => {
      const scopesToSessionActiveEncounter = clauses.some((clause) =>
        clause.includes("active_encounter_id"),
      );
      if (!isSessionActiveEncounter && scopesToSessionActiveEncounter) {
        return [];
      }
      return [encounter];
    }),
  };

  return qb;
}

function setup(isSessionActiveEncounter: boolean) {
  const levelUpService = {
    execute: jest.fn().mockResolvedValue({ ok: true }),
  };
  const participantRepo = {
    find: jest.fn().mockResolvedValue([
      {
        id: PARTICIPANT_ID,
        encounterId: ENCOUNTER_ID,
        characterId: CHARACTER_ID,
        type: "pc",
      },
    ]),
  };
  const queryBuilder = makeQueryBuilder(isSessionActiveEncounter);
  const encounterRepo = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };

  const controller = new CharactersController(
    {} as any,
    {} as any,
    {} as any,
    levelUpService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    participantRepo as any,
    encounterRepo as any,
  );

  return { controller, levelUpService, queryBuilder };
}

const request = { user: { id: USER_ID } } as any;
const payload = { classSlug: "fighter", hpMethod: "fixed" } as any;

describe("CharactersController level-up combat gate", () => {
  it("permite level-up quando o encounter active ficou stale fora da sessão atual", async () => {
    const { controller, levelUpService, queryBuilder } = setup(false);

    await expect(
      controller.levelUp(request, CHARACTER_ID, payload),
    ).resolves.toEqual({ ok: true });

    expect(queryBuilder.innerJoin).toHaveBeenCalledWith("e.session", "s");
    expect(levelUpService.execute).toHaveBeenCalledWith(
      USER_ID,
      CHARACTER_ID,
      payload,
    );
  });

  it("bloqueia level-up quando o PC está no próprio turno do encounter ativo da sessão", async () => {
    const { controller, levelUpService } = setup(true);

    await expect(controller.levelUp(request, CHARACTER_ID, payload)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(levelUpService.execute).not.toHaveBeenCalled();
  });
});
