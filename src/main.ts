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
  const isDev = process.env.NODE_ENV !== "production";
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (isDev) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: "Content-Type,Authorization,traceparent,x-diad-domain",
    exposedHeaders: "traceparent",
  });

  app.get(ProblemFactory);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const fieldErrors: { path: string; message: string }[] = [];
        const flatten = (errs: typeof errors, prefix = ""): void => {
          for (const e of errs) {
            const path = prefix ? `${prefix}.${e.property}` : e.property;
            if (e.constraints) {
              for (const message of Object.values(e.constraints)) {
                fieldErrors.push({ path: path || "body", message });
              }
            }
            if (e.children?.length) flatten(e.children, path);
          }
        };
        flatten(errors);
        const summary =
          fieldErrors.map((f) => `${f.path}: ${f.message}`).join("; ") ||
          "Payload inválido.";
        return new ValidationException(
          ErrorCode.VALIDATION_INVALID_PAYLOAD,
          summary,
          { errors: fieldErrors },
        );
      },
    }),
  );
  app.useGlobalFilters(app.get(GlobalExceptionFilter));
  await app.listen(process.env.PORT || 9001, "0.0.0.0");
}
void bootstrap();
