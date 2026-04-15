import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ROOM_AUTHORIZER, RoomAuthorizer, parseRoomKey } from './room-authorizer.interface';

@Injectable()
export class RoomAuthorizerRegistry {
  private readonly logger = new Logger(RoomAuthorizerRegistry.name);
  private readonly byPrefix = new Map<string, RoomAuthorizer>();

  constructor(
    @Optional() @Inject(ROOM_AUTHORIZER)
    injected?: RoomAuthorizer | RoomAuthorizer[] | null,
  ) {
    const list: RoomAuthorizer[] = Array.isArray(injected)
      ? injected
      : injected
        ? [injected]
        : [];
    for (const authorizer of list) {
      if (this.byPrefix.has(authorizer.prefix)) {
        this.logger.warn(
          `Duplicate RoomAuthorizer for prefix "${authorizer.prefix}" — keeping the first registered.`,
        );
        continue;
      }
      this.byPrefix.set(authorizer.prefix, authorizer);
    }
  }

  async canJoin(userId: string, roomKey: string): Promise<AuthorizationResult> {
    const parsed = parseRoomKey(roomKey);
    if (!parsed) return { ok: false, reason: 'INVALID_ROOM_KEY' };

    const authorizer = this.byPrefix.get(parsed.prefix);
    if (!authorizer) return { ok: false, reason: 'UNKNOWN_PREFIX' };

    const allowed = await authorizer.canJoin(userId, roomKey);
    return allowed ? { ok: true } : { ok: false, reason: 'UNAUTHORIZED' };
  }

  getRegisteredPrefixes(): string[] {
    return Array.from(this.byPrefix.keys());
  }
}

export type AuthorizationResult =
  | { ok: true }
  | { ok: false; reason: 'INVALID_ROOM_KEY' | 'UNKNOWN_PREFIX' | 'UNAUTHORIZED' };
