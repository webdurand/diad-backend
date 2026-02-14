import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmConfig } from './config/typeorm.config';
import { AdminModule } from './models/admin/admin.module';
import { LibraryModule } from './models/library/library.module';
import { AuthModule } from './models/auth/auth.module';
import { CharactersModule } from './models/characters/characters.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync(TypeOrmConfig),
    AdminModule,
    LibraryModule,
    AuthModule,
    CharactersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
