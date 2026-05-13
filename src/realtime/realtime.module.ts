import { FactoryProvider, Module } from "@nestjs/common";
import { AuthModule } from "src/models/auth/auth.module";
import { UserRoomAuthorizer } from "./authorizers/user-room.authorizer";
import { RealtimeGateway } from "./realtime.gateway";
import { RealtimeService } from "./realtime.service";
import { RoomAuthorizerRegistry } from "./room-authorizer.registry";
import { ROOM_AUTHORIZER } from "./room-authorizer.interface";


@Module({
  imports: [AuthModule],
  providers: [
    RealtimeService,
    RoomAuthorizerRegistry,
    RealtimeGateway,
    UserRoomAuthorizer,
    {
      provide: ROOM_AUTHORIZER,
      useFactory: (authorizer: UserRoomAuthorizer) => authorizer,
      inject: [UserRoomAuthorizer],
      multi: true,
    } as FactoryProvider,
  ],
  exports: [RealtimeService, RoomAuthorizerRegistry],
})
export class RealtimeModule {}
