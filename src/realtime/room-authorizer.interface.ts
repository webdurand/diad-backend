
export interface RoomAuthorizer {
  readonly prefix: string;
  canJoin(userId: string, roomKey: string): Promise<boolean>;
}

export const ROOM_AUTHORIZER = Symbol("ROOM_AUTHORIZER");

const ROOM_KEY_PATTERN = /^([a-z_]+):([a-zA-Z0-9_-]+)$/;

export interface ParsedRoomKey {
  prefix: string;
  id: string;
}

export function parseRoomKey(roomKey: string): ParsedRoomKey | null {
  const match = ROOM_KEY_PATTERN.exec(roomKey);
  if (!match) return null;
  return { prefix: match[1], id: match[2] };
}
