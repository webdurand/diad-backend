import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import cookieParser from "cookie-parser";
import { json, urlencoded } from "express";
import { GlobalExceptionFilter } from "./common/observability/errors/global-exception.filter";
import { ProblemFactory } from "./common/observability/errors/problem.factory";
import { ValidationException } from "./common/observability/errors/diad-exception";
import { ErrorCode } from "./common/observability/errors/error-codes.catalog";

/**
 * `EncounterCommandLockInterceptor` serializa comandos de combate com um Map em
 * memória. Isso é correto porque o backend roda como UM processo. Se algum dia
 * subir com PM2/cluster/réplicas, o lock deixa silenciosamente de proteger e o
 * lost update de duplo-submit volta. Este aviso existe para que a mudança de
 * topologia não passe despercebida.
 */
function assertSingleProcessInvariant(): void {
  const multiInstanceVars = [
    "WEB_CONCURRENCY",
    "NODE_APP_INSTANCE",
    "PM2_HOME",
    "PM2_INSTANCE_ID",
  ].filter((name) => process.env[name] !== undefined);

  if (multiInstanceVars.length > 0) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "startup.single_process_invariant_violated",
        "service.name": "diad-backend",
        attributes: {
          detected: multiInstanceVars,
          hint: "O lock de comando por encontro é em processo. Com mais de uma instância ele não protege — migre para advisory lock no Postgres ou Redis antes de escalar horizontalmente.",
        },
      }),
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  const bodyLimit = process.env.REQUEST_BODY_LIMIT ?? "2mb";
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
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
    // x-client-id identifica a ABA que originou o comando: o broadcast de
    // snapshot volta para a sala inteira (socket.io inclui o emissor), e sem
    // esse header a aba que agiu aplicaria o próprio eco duas vezes.
    allowedHeaders:
      "Content-Type,Authorization,traceparent,x-diad-domain,x-client-id",
    exposedHeaders: "traceparent",
  });

  assertSingleProcessInvariant();

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
