import { MigrationInterface, QueryRunner } from "typeorm";

export class EnforceGameEventSequenceUniqueness1809310000000
  implements MigrationInterface
{
  name = "EnforceGameEventSequenceUniqueness1809310000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // Trava a tabela ANTES de renumerar. Sem isso existe uma janela real: um
    // combate em andamento insere um evento entre o UPDATE de renumeração e o
    // CREATE UNIQUE INDEX, o índice aborta por violação e a migration derruba o
    // deploy inteiro. SHARE bloqueia INSERT/UPDATE/DELETE de OUTRAS transações;
    // o próprio UPDATE desta migration não é afetado, porque conflito de lock só
    // é avaliado entre transações distintas.
    await queryRunner.query(`LOCK TABLE "game_events" IN SHARE MODE`);

    // Renumera as sessões que já tinham (session_id, sequence) repetido: sem isso
    // o CREATE UNIQUE INDEX abaixo falha e a migration derruba o deploy. Renumerar
    // em vez de apagar preserva TODOS os eventos (Princípio X) e mantém a ordem
    // original de leitura, porque o ROW_NUMBER respeita (sequence, created_at, id).
    // A operação é idempotente: sem duplicatas, nenhuma linha é tocada.
    await queryRunner.query(`
      UPDATE "game_events" AS e
      SET "sequence" = renumbered.new_sequence
      FROM (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "session_id"
            ORDER BY "sequence", "created_at", "id"
          ) AS new_sequence
        FROM "game_events"
        WHERE "session_id" IN (
          SELECT "session_id"
          FROM "game_events"
          GROUP BY "session_id", "sequence"
          HAVING COUNT(*) > 1
        )
      ) AS renumbered
      WHERE e."id" = renumbered."id"
        AND e."sequence" <> renumbered.new_sequence
    `);

    // O pg_advisory_xact_lock de EventService.emit existe para garantir que
    // (session_id, sequence) seja único, mas o banco nunca cobrou esse invariante:
    // qualquer escrita que escape do lock corrompia a timeline em silêncio. Índice
    // UNIQUE (e não CONSTRAINT) por dois motivos: aceita IF NOT EXISTS, e o
    // @Index({ unique: true }) da entidade mapeia exatamente para ele — assim um
    // migration:generate futuro não fica oscilando entre índice e constraint.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_game_events_session_sequence"
      ON "game_events" ("session_id", "sequence")
    `);

    // Todo INSERT em game_events pagava quatro índices. IDX_game_events_session_sequence
    // era cópia literal de IDX_ge_session_seq, e ambos ficaram redundantes agora que
    // o índice UNIQUE cobre (session_id, sequence) — inclusive o MAX(sequence) da
    // alocação, que continua index-only. IDX_game_events_encounter_id é prefixo
    // esquerdo de IDX_ge_encounter_seq, que fica e serve a timeline do encontro.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_game_events_session_sequence"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ge_session_seq"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_game_events_encounter_id"`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Recria primeiro para que (session_id, sequence) nunca fique sem índice.
    // A renumeração do up() não é revertida: nenhum evento foi perdido, mas
    // restaurar sequences duplicadas seria recriar o bug de propósito.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ge_session_seq"
       ON "game_events" ("session_id", "sequence")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_game_events_session_sequence"
       ON "game_events" ("session_id", "sequence")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_game_events_encounter_id"
       ON "game_events" ("encounter_id")`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_game_events_session_sequence"`,
    );
  }
}
