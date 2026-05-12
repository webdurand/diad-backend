import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  CampaignEntity,
  CampaignPartyMemberEntity,
  CampaignPlayerEntity,
  CharacterEntity,
  CharacterClassEntity,
  CharacterStateEntity,
  CompanionTemplateEntity,
  GameSessionEntity,
  LocationEntity,
  SceneEntity,
} from "src/entities";
import { AuthModule } from "../auth/auth.module";
import { CharactersModule } from "../characters/characters.module";
import { PartiesController } from "./parties.controller";
import { PartiesService } from "./services/parties.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CampaignEntity,
      CampaignPlayerEntity,
      CampaignPartyMemberEntity,
      CharacterEntity,
      CharacterClassEntity,
      CharacterStateEntity,
      CompanionTemplateEntity,
      GameSessionEntity,
      SceneEntity,
      LocationEntity,
    ]),
    AuthModule,
    CharactersModule,
  ],
  controllers: [PartiesController],
  providers: [PartiesService],
  exports: [PartiesService],
})
export class PartiesModule {}
