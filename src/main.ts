import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  // Habilita CORS para o frontend rodando na porta 3001
  app.enableCors(); // Essencial para o Next.js conseguir falar com ele
  await app.listen(process.env.PORT || 3000, '0.0.0.0');
}
bootstrap();
