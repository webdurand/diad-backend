import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GameEventEntity } from "src/entities/game-event.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { PendingGuardDispatchEntity } from "src/entities/pending-guard-dispatch.entity";
import { AuthModule } from "../auth/auth.module";
import { SessionModule } from "../session/session.module";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { CharactersModule } from "../characters/characters.module";
import { AiProxyController } from "./ai-proxy.controller";
import { AiProxyService } from "./ai-proxy.service";

@Module({
  imports: [
    AuthModule,
    SessionModule,
    CharactersModule,
    TypeOrmModule.forFeature([
      GameEventEntity,
      PendingGuardDispatchEntity,
      GameSessionEntity,
    ]),
    forwardRef(() => GameEngineModule),
  ],
  controllers: [AiProxyController],
  providers: [AiProxyService],
  exports: [AiProxyService],
})
export class AiProxyModule {}
