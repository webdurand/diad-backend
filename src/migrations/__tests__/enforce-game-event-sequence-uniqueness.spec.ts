import type { QueryRunner } from "typeorm";
import { EnforceGameEventSequenceUniqueness1809310000000 } from "../1809310000000-EnforceGameEventSequenceUniqueness";

function recordingRunner(): { runner: QueryRunner; sql: string[] } {
  const sql: string[] = [];
  const runner = {
    query: jest.fn(async (statement: string) => {
      sql.push(statement.replace(/\s+/g, " ").trim());
      return [];
    }),
  } as unknown as QueryRunner;
  return { runner, sql };
}

function indexOfMatch(sql: string[], needle: string): number {
  return sql.findIndex((statement) => statement.includes(needle));
}

describe("EnforceGameEventSequenceUniqueness1809310000000.up", () => {
  it("renumera duplicatas ANTES de criar a UNIQUE, senão o deploy quebra", async () => {
    const { runner, sql } = recordingRunner();

    await new EnforceGameEventSequenceUniqueness1809310000000().up(runner);

    const lockAt = indexOfMatch(sql, "LOCK TABLE");
    const renumberAt = indexOfMatch(sql, "ROW_NUMBER()");
    const uniqueAt = indexOfMatch(sql, "UQ_game_events_session_sequence");

    // O LOCK vem primeiro: sem ele um combate em andamento pode inserir um
    // evento entre a renumeração e o CREATE UNIQUE INDEX, e o índice aborta.
    expect(lockAt).toBe(0);
    expect(sql[lockAt]).toContain("IN SHARE MODE");
    expect(renumberAt).toBe(1);
    expect(sql[renumberAt]).toContain("HAVING COUNT(*) > 1");
    expect(renumberAt).toBeLessThan(uniqueAt);
  });

  it("cria o índice UNIQUE (session_id, sequence) de forma idempotente", async () => {
    const { runner, sql } = recordingRunner();

    await new EnforceGameEventSequenceUniqueness1809310000000().up(runner);

    const unique = sql.find((statement) =>
      statement.includes("UQ_game_events_session_sequence"),
    );
    expect(unique).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(unique).toContain('("session_id", "sequence")');
  });

  it("dropa as duplicatas de índice e mantém IDX_ge_encounter_seq", async () => {
    const { runner, sql } = recordingRunner();

    await new EnforceGameEventSequenceUniqueness1809310000000().up(runner);

    const drops = sql.filter((statement) => statement.startsWith("DROP INDEX"));
    expect(drops).toEqual([
      'DROP INDEX IF EXISTS "IDX_game_events_session_sequence"',
      'DROP INDEX IF EXISTS "IDX_ge_session_seq"',
      'DROP INDEX IF EXISTS "IDX_game_events_encounter_id"',
    ]);
    // A timeline do encontro (GET /encounters/:id/events) depende dele.
    expect(sql.join(" ")).not.toContain(
      'DROP INDEX IF EXISTS "IDX_ge_encounter_seq"',
    );
  });

  it("só dropa índices depois que a UNIQUE existe (nunca deixa a coluna sem índice)", async () => {
    const { runner, sql } = recordingRunner();

    await new EnforceGameEventSequenceUniqueness1809310000000().up(runner);

    const uniqueAt = indexOfMatch(sql, "CREATE UNIQUE INDEX");
    const firstDropAt = sql.findIndex((statement) =>
      statement.startsWith("DROP INDEX"),
    );
    expect(uniqueAt).toBeLessThan(firstDropAt);
  });
});

describe("EnforceGameEventSequenceUniqueness1809310000000.down", () => {
  it("recria os índices antes de remover a UNIQUE", async () => {
    const { runner, sql } = recordingRunner();

    await new EnforceGameEventSequenceUniqueness1809310000000().down(runner);

    const recreated = sql.filter((statement) =>
      statement.startsWith("CREATE INDEX IF NOT EXISTS"),
    );
    expect(recreated).toHaveLength(3);
    const dropUniqueAt = indexOfMatch(
      sql,
      'DROP INDEX IF EXISTS "UQ_game_events_session_sequence"',
    );
    expect(dropUniqueAt).toBe(sql.length - 1);
  });
});
