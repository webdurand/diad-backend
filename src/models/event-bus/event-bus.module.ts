import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventBusController } from "./event-bus.controller";


@Module({
  imports: [AuthModule],
  controllers: [EventBusController],
})
export class EventBusHttpModule {}
