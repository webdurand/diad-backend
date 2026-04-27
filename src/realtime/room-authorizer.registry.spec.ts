import { RoomAuthorizerRegistry } from "./room-authorizer.registry";
import { RoomAuthorizer } from "./room-authorizer.interface";

class FakeAuthorizer implements RoomAuthorizer {
  constructor(
    public readonly prefix: string,
    private readonly allow: (userId: string, roomKey: string) => boolean,
  ) {}
  canJoin(userId: string, roomKey: string): Promise<boolean> {
    return Promise.resolve(this.allow(userId, roomKey));
  }
}

describe("RoomAuthorizerRegistry", () => {
  it("accepts a single authorizer (non-array injection)", async () => {
    const registry = new RoomAuthorizerRegistry(
      new FakeAuthorizer("user", () => true),
    );
    expect(registry.getRegisteredPrefixes()).toEqual(["user"]);
  });

  it("accepts no authorizers (null injection)", () => {
    const registry = new RoomAuthorizerRegistry(null);
    expect(registry.getRegisteredPrefixes()).toEqual([]);
  });

  it("returns INVALID_ROOM_KEY for malformed keys", async () => {
    const registry = new RoomAuthorizerRegistry([]);
    const result = await registry.canJoin("user-1", "not-a-valid-key");
    expect(result).toEqual({ ok: false, reason: "INVALID_ROOM_KEY" });
  });

  it("returns UNKNOWN_PREFIX when no authorizer is registered", async () => {
    const registry = new RoomAuthorizerRegistry([]);
    const result = await registry.canJoin("user-1", "encounter:abc");
    expect(result).toEqual({ ok: false, reason: "UNKNOWN_PREFIX" });
  });

  it("delegates to the matching authorizer and allows on true", async () => {
    const registry = new RoomAuthorizerRegistry([
      new FakeAuthorizer("user", (uid, key) => key === `user:${uid}`),
    ]);
    const result = await registry.canJoin("u1", "user:u1");
    expect(result).toEqual({ ok: true });
  });

  it("returns UNAUTHORIZED when authorizer denies", async () => {
    const registry = new RoomAuthorizerRegistry([
      new FakeAuthorizer("user", () => false),
    ]);
    const result = await registry.canJoin("u1", "user:u2");
    expect(result).toEqual({ ok: false, reason: "UNAUTHORIZED" });
  });

  it("keeps the first authorizer when duplicate prefixes are registered", async () => {
    const first = new FakeAuthorizer("encounter", () => true);
    const second = new FakeAuthorizer("encounter", () => false);
    const registry = new RoomAuthorizerRegistry([first, second]);
    const result = await registry.canJoin("u1", "encounter:e1");
    expect(result).toEqual({ ok: true });
  });

  it("lists registered prefixes", () => {
    const registry = new RoomAuthorizerRegistry([
      new FakeAuthorizer("user", () => true),
      new FakeAuthorizer("encounter", () => true),
    ]);
    expect(registry.getRegisteredPrefixes().sort()).toEqual([
      "encounter",
      "user",
    ]);
  });
});
