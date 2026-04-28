import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SessionModule } from "../session/session.module";
import { AiProxyController } from "./ai-proxy.controller";
import { AiProxyService } from "./ai-proxy.service";

@Module({
  imports: [AuthModule, SessionModule],
  controllers: [AiProxyController],
  providers: [AiProxyService],
  exports: [AiProxyService],
})
export class AiProxyModule {}
