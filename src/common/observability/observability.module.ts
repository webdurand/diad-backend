import { Global, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClsModule } from "nestjs-cls";
import { LoggerModule } from "nestjs-pino";
import { buildPinoOptions } from "./logger/pino.config";
import { DiadLogger } from "./logger/diad-logger.service";
import { ProblemFactory } from "./errors/problem.factory";
import { GlobalExceptionFilter } from "./errors/global-exception.filter";
import { OutboundFetch } from "./http/outbound-fetch.service";
import { RequestBodyLogInterceptor } from "./http/request-body.interceptor";
import { TraceContextMiddleware } from "./trace/trace-context.middleware";
import { DomainContextMiddleware } from "./domain/domain-context.middleware";
import { HealthController } from "./health/health.controller";
import { generateTraceId } from "./trace/trace-context";

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: () => generateTraceId(),
      },
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cs: ConfigService) =>
        buildPinoOptions({
          env: cs.get<string>("NODE_ENV") ?? "development",
          level: cs.get<string>("LOG_LEVEL"),
          serviceVersion: cs.get<string>("npm_package_version"),
        }),
    }),
  ],
  providers: [
    DiadLogger,
    ProblemFactory,
    OutboundFetch,
    GlobalExceptionFilter,
    RequestBodyLogInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: RequestBodyLogInterceptor,
    },
  ],
  controllers: [HealthController],
  exports: [
    DiadLogger,
    ProblemFactory,
    OutboundFetch,
    GlobalExceptionFilter,
    LoggerModule,
    ClsModule,
  ],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TraceContextMiddleware, DomainContextMiddleware)
      .forRoutes("*");
  }
}
