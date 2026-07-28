import { LibraryService } from "./library.service";

describe("LibraryService monster summaries", () => {
  function setup() {
    const queryBuilder = {
      select: jest.fn(),
      innerJoin: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      getMany: jest.fn(),
      getManyAndCount: jest.fn(),
    };
    for (const method of [
      "select",
      "innerJoin",
      "andWhere",
      "orderBy",
      "addOrderBy",
      "skip",
      "take",
    ] as const) {
      queryBuilder[method].mockReturnValue(queryBuilder);
    }
    queryBuilder.getMany.mockResolvedValue([
      {
        id: "monster-1",
        slug: "goblin",
        name: "Goblin",
        type: "humanoid",
        hit_points: 7,
        challenge_rating: 0.25,
        xp: 50,
      },
      {
        id: "monster-2",
        slug: "ancient-red-dragon",
        name: "Ancient Red Dragon",
        type: "dragon",
        hit_points: 546,
        challenge_rating: 24,
        xp: 62000,
      },
    ]);
    queryBuilder.getManyAndCount.mockResolvedValue([
      [
        {
          id: "monster-1",
          slug: "goblin",
          name: "Goblin",
          type: "humanoid",
          hit_points: 7,
          challenge_rating: 0.25,
          xp: 50,
        },
      ],
      1,
    ]);

    const entityManager = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const logger = {
      setContext: jest.fn(),
      error: jest.fn(),
    };
    const service = new LibraryService(entityManager as never, logger as never);

    return { service, queryBuilder, entityManager };
  }

  it("carrega só os campos usados e filtra buscas seguintes em memória", async () => {
    const { service, queryBuilder, entityManager } = setup();

    const result = await service.findMonsterSummaries({
      name: " gob ",
      cr: "0-1",
      limit: 20,
    });

    expect(queryBuilder.select).toHaveBeenCalledWith([
      "entity.id",
      "entity.slug",
      "entity.name",
      "entity.type",
      "entity.hit_points",
      "entity.challenge_rating",
      "entity.xp",
    ]);
    expect(result).toMatchObject({
      total: 1,
      limit: 20,
      offset: 0,
      data: [{ id: "monster-1", name: "Goblin" }],
    });

    const secondResult = await service.findMonsterSummaries({
      name: "dragon",
      cr: "18-999",
    });

    expect(secondResult).toMatchObject({
      total: 1,
      data: [{ id: "monster-2", name: "Ancient Red Dragon" }],
    });
    expect(entityManager.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(queryBuilder.getMany).toHaveBeenCalledTimes(1);
  });
});
