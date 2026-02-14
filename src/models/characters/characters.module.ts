import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharacterEntity } from 'src/entities';
import { AuthModule } from '../auth/auth.module';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';

@Module({
  imports: [TypeOrmModule.forFeature([CharacterEntity]), AuthModule],
  controllers: [CharactersController],
  providers: [CharactersService],
})
export class CharactersModule {}
