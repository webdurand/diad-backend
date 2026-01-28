import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CharacterCreationModule } from './modules/character-creation/character-creation.module';
import { AdminModule } from './modules/admin/admin.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmConfig } from './config/typeorm.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync(TypeOrmConfig),
    CharacterCreationModule,
    AdminModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
