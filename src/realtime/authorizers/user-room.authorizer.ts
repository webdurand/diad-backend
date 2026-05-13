import { Injectable } from "@nestjs/common";
import { RoomAuthorizer, parseRoomKey } from "../room-authorizer.interface";


@Injectable()
export class UserRoomAuthorizer implements RoomAuthorizer {
  readonly prefix = "user";

  canJoin(userId: string, roomKey: string): Promise<boolean> {
    const parsed = parseRoomKey(roomKey);
    if (!parsed || parsed.prefix !== this.prefix) {
      return Promise.resolve(false);
    }
    return Promise.resolve(parsed.id === userId);
  }
}
