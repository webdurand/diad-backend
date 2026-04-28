import { Injectable } from "@nestjs/common";
import type { SceneContext } from "./scene-context.service";

const TTL_MS = 60_000;
const MAX_ENTRIES = 200;

interface Entry {
  ctx: SceneContext;
  expiresAt: number;
}

/**
 * In-process cache for SceneContext keyed by sceneId.
 *
 * Backend-authoritative DM agent calls assemble() on every /message, /action
 * and /narrate-start. Without cache, combat-heavy sessions would multiply
 * Neon load (20-25 queries × 5 actions/min). TTL=60s covers rajadas; LRU cap
 * limits memory on Render free plan.
 *
 * Invalidation is explicit — SceneService calls .invalidate(sceneId) after
 * mutations (transitionTo, addNpc, removeNpc, update). Stale data otherwise
 * confuses the DM (NPC fantasma, cena ausente).
 */
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
