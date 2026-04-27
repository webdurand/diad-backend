import { Injectable, Logger } from "@nestjs/common";
import type { Server } from "socket.io";

/**
 * Programmatic API exposed to domain services for emitting realtime events.
 * The gateway assigns the underlying `Server` via `setServer` at bootstrap.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  emitToRoom(roomKey: string, eventName: string, payload: unknown): void {
    if (!this.server) {
      this.logger.debug(`emitToRoom skipped (server not ready): ${eventName}`);
      return;
    }
    this.server.to(roomKey).emit(eventName, payload);
  }

  emitToUser(userId: string, eventName: string, payload: unknown): void {
    this.emitToRoom(`user:${userId}`, eventName, payload);
  }

  broadcastToUsers(
    userIds: string[],
    eventName: string,
    payload: unknown,
  ): void {
    for (const userId of userIds) {
      this.emitToUser(userId, eventName, payload);
    }
  }

  async disconnectUser(userId: string, reason?: string): Promise<void> {
    if (!this.server) return;
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    for (const socket of sockets) {
      if (reason) socket.emit("server:disconnect", { reason });
      socket.disconnect(true);
    }
  }

  async isUserConnected(userId: string): Promise<boolean> {
    if (!this.server) return false;
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    return sockets.length > 0;
  }
}
