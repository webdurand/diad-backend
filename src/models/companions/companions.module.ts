import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CompanionsController } from "./companions.controller";
import { CompanionsService } from "./services/companions.service";

@Module({
  imports: [AuthModule],
  controllers: [CompanionsController],
  providers: [CompanionsService],
  exports: [CompanionsService],
})
export class CompanionsModule {}
