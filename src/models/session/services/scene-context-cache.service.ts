import { Injectable } from "@nestjs/common";
import type { SceneContext } from "./scene-context.service";

const TTL_MS = 60_000;
const MAX_ENTRIES = 200;

interface Entry {
  ctx: SceneContext;
  expiresAt: number;
}


@Injectable()
export class SceneContextCacheService {
  private store = new Map<string, Entry>();

  get(sceneId: string): SceneContext | null {
    const entry = this.store.get(sceneId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(sceneId);
      return null;
    }
    return entry.ctx;
  }

  set(sceneId: string, ctx: SceneContext): void {
    this.store.set(sceneId, { ctx, expiresAt: Date.now() + TTL_MS });
    if (this.store.size > MAX_ENTRIES) {
      this.evictOldest();
    }
  }

  invalidate(sceneId: string): void {
    this.store.delete(sceneId);
  }

  invalidateAll(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestExpiresAt = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.expiresAt < oldestExpiresAt) {
        oldestExpiresAt = entry.expiresAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }
}
