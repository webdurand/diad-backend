import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModuleAsyncOptions } from "@nestjs/typeorm";
import { ENTITIES } from "src/entities";
import type { LogLevel } from "typeorm";

const QUERY_LOG_LEVELS: LogLevel[] = ["query", "error"];

export const TypeOrmConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    return {
      type: "postgres",
      url: configService.get<string>("DATABASE_URL"),
      ssl: { rejectUnauthorized: false },
      migrations: [],

      synchronize: false,
      entities: [...ENTITIES],

      // Perf 2026-07-27: o default do node-postgres é `max: 10`, e
      // `CharacterSheetService.computeSheet` dispara um Promise.all de 11
      // queries — uma delas ficava esperando conexão livre, criando um segundo
      // estágio de latência dentro da MESMA request. `min` + keepAlive evitam
      // que o pool zere entre interações e cada clique pague TLS handshake
      // novo contra o Neon.
      extra: {
        max: Number(configService.get<string>("DB_POOL_MAX") ?? 20),
        min: Number(configService.get<string>("DB_POOL_MIN") ?? 4),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
        application_name: "diad-backend",
      },

      // Sem isso o app não emite SQL nenhum e não há como medir round-trips.
      // Ligue com TYPEORM_LOG_QUERIES=1 para contar queries por request.
      logging: configService.get<string>("TYPEORM_LOG_QUERIES")
        ? QUERY_LOG_LEVELS
        : false,
      maxQueryExecutionTime: 200,
    };
  },
};
