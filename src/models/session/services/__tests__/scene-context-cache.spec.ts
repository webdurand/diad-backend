import { SceneContextCacheService } from "../scene-context-cache.service";
import type { SceneContext } from "../scene-context.service";

const fakeCtx = (title: string): SceneContext => ({
  scene: { title },
  npcsPresent: [],
  recentEvents: [],
  partyKnowledge: [],
  locationChain: [],
  recentChronicles: [],
  playerCharacter: null,
  availableLocations: [],
  availablePois: [],
  stage: {
    availablePois: [],
    npcsPresent: [],
    nearbyNpcs: [],
    currentInterlocutor: null,
    mentionedEntities: [],
  },
  travelState: null,
});

describe("SceneContextCacheService", () => {
  let cache: SceneContextCacheService;

  beforeEach(() => {
    cache = new SceneContextCacheService();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-28T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns null for unknown sceneId", () => {
    expect(cache.get("unknown")).toBeNull();
  });

  it("returns cached value within TTL", () => {
    const ctx = fakeCtx("Cripta");
    cache.set("scene-1", ctx);
    expect(cache.get("scene-1")).toBe(ctx);
  });

  it("returns null after TTL expires", () => {
    cache.set("scene-1", fakeCtx("Cripta"));
    jest.advanceTimersByTime(60_000 + 1);
    expect(cache.get("scene-1")).toBeNull();
  });

  it("invalidate removes single entry without affecting others", () => {
    cache.set("scene-1", fakeCtx("A"));
    cache.set("scene-2", fakeCtx("B"));
    cache.invalidate("scene-1");
    expect(cache.get("scene-1")).toBeNull();
    expect(cache.get("scene-2")?.scene.title).toBe("B");
  });

  it("invalidateAll clears every entry", () => {
    cache.set("scene-1", fakeCtx("A"));
    cache.set("scene-2", fakeCtx("B"));
    cache.invalidateAll();
    expect(cache.size()).toBe(0);
  });

  it("evicts oldest entry when exceeding MAX_ENTRIES", () => {



    for (let i = 0; i < 201; i++) {
      jest.advanceTimersByTime(1);
      cache.set(`scene-${i}`, fakeCtx(String(i)));
    }
    expect(cache.size()).toBe(200);
    expect(cache.get("scene-0")).toBeNull();
    expect(cache.get("scene-200")?.scene.title).toBe("200");
  });

  it("set on existing key refreshes TTL", () => {
    cache.set("scene-1", fakeCtx("v1"));
    jest.advanceTimersByTime(40_000);
    cache.set("scene-1", fakeCtx("v2"));
    jest.advanceTimersByTime(30_000);

    expect(cache.get("scene-1")?.scene.title).toBe("v2");
  });
});
