import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  UserEntity,
  CharacterEntity,
  ClassEntity,
  SubclassEntity,
  EquipmentEntity,
  CharacterEquipmentEntity,
  AdminAuditLogEntity,
} from "src/entities";
import { ENTITIES } from "../../entities";
import { AdminController } from "./admin.controller";
import { AdminMetricsController } from "./admin-metrics.controller";
import { AdminService } from "./admin.service";
import { SeedCharacterService } from "./services/seed-character.service";
import { AdminMetricsService } from "./services/admin-metrics.service";
import { AdminAuditService } from "./services/admin-audit.service";
import { AuthModule } from "../auth/auth.module";
import { CharactersModule } from "../characters/characters.module";

@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
    TypeOrmModule.forFeature([
      UserEntity,
      CharacterEntity,
      ClassEntity,
      SubclassEntity,
      EquipmentEntity,
      CharacterEquipmentEntity,
      AdminAuditLogEntity,
    ]),
    AuthModule,
    CharactersModule,
  ],
  controllers: [AdminController, AdminMetricsController],
  providers: [
    AdminService,
    SeedCharacterService,
    AdminMetricsService,
    AdminAuditService,
  ],
  exports: [AdminMetricsService, AdminAuditService],
})
export class AdminModule {}
