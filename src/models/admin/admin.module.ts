import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  UserEntity,
  CharacterEntity,
  ClassEntity,
  SubclassEntity,
} from 'src/entities';
import { ENTITIES } from '../../entities';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SeedCharacterService } from './services/seed-character.service';
import { AuthModule } from '../auth/auth.module';
import { CharactersModule } from '../characters/characters.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
    TypeOrmModule.forFeature([
      UserEntity,
      CharacterEntity,
      ClassEntity,
      SubclassEntity,
    ]),
    AuthModule,
    CharactersModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, SeedCharacterService],
})
export class AdminModule {}
