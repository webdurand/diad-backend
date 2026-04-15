import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { AuthService } from 'src/models/auth/auth.service';
import { RealtimeService } from './realtime.service';
import { RoomAuthorizerRegistry } from './room-authorizer.registry';

@WebSocketGateway({
  namespace: '/rt',
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'https://diad-frontend.vercel.app',
    ],
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly registry: RoomAuthorizerRegistry,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(): void {
    this.realtime.setServer(this.server);
    // Authenticate inside the namespace middleware (runs BEFORE connect), so
    // `socket.data.userId` is guaranteed to exist by the time any message
    // handler runs. A late async handleConnection would race with the client.
    this.server.use(async (socket, next) => {
      try {
        const userId = await this.authenticate(socket as unknown as Socket);
        (socket as unknown as Socket).data.userId = userId;
        next();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'auth failed';
        next(new Error(message));
      }
    });
    this.logger.log(
      `Realtime gateway ready at /rt. Prefixes: ${this.registry.getRegisteredPrefixes().join(', ')}`,
    );
  }

  async handleConnection(socket: Socket): Promise<void> {
    const userId = socket.data.userId as string | undefined;
    if (!userId) {
      // Middleware already rejected; nothing to do.
      return;
    }
    await socket.join(`user:${userId}`);
    this.logger.debug(`socket connected: ${socket.id} user=${userId}`);
  }

  handleDisconnect(socket: Socket): void {
    this.logger.debug(`socket disconnected: ${socket.id}`);
  }

  @SubscribeMessage('join')
  async onJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { roomKey?: string } | undefined,
  ): Promise<{ ok: boolean; error?: string }> {
    const userId = socket.data.userId as string | undefined;
    if (!userId) return { ok: false, error: 'UNAUTHORIZED' };

    const roomKey = body?.roomKey;
    if (!roomKey || typeof roomKey !== 'string') {
      return { ok: false, error: 'INVALID_ROOM_KEY' };
    }

    const result = await this.registry.canJoin(userId, roomKey);
    if (!result.ok) return { ok: false, error: result.reason };

    await socket.join(roomKey);
    return { ok: true };
  }

  @SubscribeMessage('leave')
  async onLeave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { roomKey?: string } | undefined,
  ): Promise<{ ok: boolean }> {
    const roomKey = body?.roomKey;
    if (!roomKey || typeof roomKey !== 'string') return { ok: false };
    await socket.leave(roomKey);
    return { ok: true };
  }

  private async authenticate(socket: Socket): Promise<string> {
    const token = this.extractToken(socket);
    if (!token) throw new Error('missing session cookie');
    const user = await this.authService.getUserFromToken(token);
    return user.id;
  }

  private extractToken(socket: Socket): string | null {
    const cookieName = this.authService.getCookieName();

    const authToken = (socket.handshake.auth as { token?: unknown } | undefined)
      ?.token;
    if (typeof authToken === 'string' && authToken.length > 0) return authToken;

    const rawCookieHeader = socket.handshake.headers.cookie;
    const rawCookie: string | undefined = Array.isArray(rawCookieHeader)
      ? rawCookieHeader.join('; ')
      : (rawCookieHeader as string | undefined);
    if (!rawCookie) return null;
    const parsed = parseCookie(rawCookie);
    return parsed[cookieName] ?? null;
  }
}
