import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  // Habilita CORS para todas as origens com suporte a credenciais (deploy)
  app.enableCors({
    origin: true, // Aceita qualquer origem
    credentials: true, // Permite cookies/auth
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type,Authorization',
  });
  await app.listen(process.env.PORT || 3000, '0.0.0.0');
}
bootstrap();
