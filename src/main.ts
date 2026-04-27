import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import cookieParser from "cookie-parser";
import { GlobalExceptionFilter } from "./common/observability/errors/global-exception.filter";
import { ProblemFactory } from "./common/observability/errors/problem.factory";
import { ValidationException } from "./common/observability/errors/diad-exception";
import { ErrorCode } from "./common/observability/errors/error-codes.catalog";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(cookieParser());
  const allowedOrigins = [
    "http://localhost:9001",
    "http://localhost:9002",
    "http://127.0.0.1:9001",
    "http://127.0.0.1:9002",
    "https://diad-frontend.vercel.app",
  ];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: "Content-Type,Authorization,traceparent",
    exposedHeaders: "traceparent",
  });
  // Resolve infra de observability do DI antes de configurar pipes/filters.
  app.get(ProblemFactory);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((e) =>
          Object.values(e.constraints ?? {}),
        );
        return new ValidationException(
          ErrorCode.VALIDATION_INVALID_PAYLOAD,
          messages.join("; ") || "Payload inválido.",
          {
            errors: messages.map((m) => ({ path: "body", message: m })),
          },
        );
      },
    }),
  );
  app.useGlobalFilters(app.get(GlobalExceptionFilter));
  await app.listen(process.env.PORT || 9001, "0.0.0.0");
}
void bootstrap();
