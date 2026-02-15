import { ObjectLiteral, Repository } from 'typeorm';

type MockRepository<T extends ObjectLiteral = ObjectLiteral> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

export function createMockRepository<
  T extends ObjectLiteral = ObjectLiteral,
>(): MockRepository<T> {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn().mockResolvedValue(null),
    findOneOrFail: jest.fn().mockResolvedValue(null),
    save: jest
      .fn()
      .mockImplementation((entity) =>
        Promise.resolve({ id: 'mock-id', ...entity }),
      ),
    create: jest.fn().mockImplementation((entity) => entity),
    remove: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    }),
  };
}

export function createMockDataSource() {
  return {
    transaction: jest
      .fn()
      .mockImplementation(
        async (cb: (manager: unknown) => Promise<unknown>) => {
          const manager = {
            save: jest
              .fn()
              .mockImplementation((_entityClass: unknown, entity: unknown) =>
                Promise.resolve({
                  id: 'mock-id',
                  ...(entity as Record<string, unknown>),
                }),
              ),
            create: jest
              .fn()
              .mockImplementation(
                (_entityClass: unknown, entity: unknown) => entity,
              ),
            findOne: jest.fn().mockResolvedValue(null),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
            remove: jest.fn().mockResolvedValue(undefined),
            find: jest.fn().mockResolvedValue([]),
            createQueryBuilder: jest.fn().mockReturnValue({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({ affected: 1 }),
            }),
          };
          return cb(manager);
        },
      ),
  };
}
