import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  // Habilita CORS para o frontend rodando na porta 3001
  app.enableCors({
    origin: 'http://localhost:3001',
    credentials: true,
  });
  await app.listen(3000);
}
bootstrap();
