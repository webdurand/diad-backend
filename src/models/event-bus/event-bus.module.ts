import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventBusController } from "./event-bus.controller";

/**
 * Spec 017 — Module HTTP do Event Bus.
 *
 * Não-global (controller-only). Importa `AuthModule` pra usar `AuthGuard`.
 * `EventBusService`, `AudienceMapService`, `EventEnvelopeFactory` vêm do
 * `EventBusModule` global em `src/common/event-bus/`.
 */
@Module({
  imports: [AuthModule],
  controllers: [EventBusController],
})
export class EventBusHttpModule {}
