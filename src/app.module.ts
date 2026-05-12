import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TypeOrmConfig } from "./config/typeorm.config";
import { ObservabilityModule } from "./common/observability/observability.module";
import { EventBusModule } from "./common/event-bus/event-bus.module";
import { AdminModule } from "./models/admin/admin.module";
import { LibraryModule } from "./models/library/library.module";
import { AuthModule } from "./models/auth/auth.module";
import { CharactersModule } from "./models/characters/characters.module";
import { GameEngineModule } from "./models/game-engine/game-engine.module";
import { QuickPlayModule } from "./models/quick-play/quick-play.module";
import { WorldModule } from "./models/world/world.module";
import { SessionModule } from "./models/session/session.module";
import { AiProxyModule } from "./models/ai-proxy/ai-proxy.module";
import { AiDmModule } from "./models/ai-dm/ai-dm.module";
import { PartiesModule } from "./models/parties/parties.module";
import { CompanionsModule } from "./models/companions/companions.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { EventBusHttpModule } from "./models/event-bus/event-bus.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    ObservabilityModule,
    TypeOrmModule.forRootAsync(TypeOrmConfig),
    EventBusModule,
    AdminModule,
    LibraryModule,
    AuthModule,
    CharactersModule,
    GameEngineModule,
    QuickPlayModule,
    WorldModule,
    SessionModule,
    AiProxyModule,
    AiDmModule,
    PartiesModule,
    CompanionsModule,
    RealtimeModule,
    EventBusHttpModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
