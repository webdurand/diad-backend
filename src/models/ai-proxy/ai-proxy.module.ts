import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GameEventEntity } from "src/entities/game-event.entity";
import { AuthModule } from "../auth/auth.module";
import { SessionModule } from "../session/session.module";
import { AiProxyController } from "./ai-proxy.controller";
import { AiProxyService } from "./ai-proxy.service";

@Module({
  imports: [
    AuthModule,
    SessionModule,
    // Spec 027 (M2 follow-up) — read-only de game_events pra injetar
    // `encounter_outcome_summary` / `fate_ladder_resolved` em sceneContext
    // quando systemHint='post_combat'|'post_fate_choice'. Forfeature
    // cobre o repo sem importar GameEngineModule (que importaria AiProxyModule
    // de volta — circular).
    TypeOrmModule.forFeature([GameEventEntity]),
  ],
  controllers: [AiProxyController],
  providers: [AiProxyService],
  exports: [AiProxyService],
})
export class AiProxyModule {}
