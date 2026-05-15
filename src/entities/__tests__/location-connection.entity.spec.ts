import { LocationConnectionEntity } from "../location-connection.entity";

describe("LocationConnectionEntity", () => {
  it("blocks access until current phase reaches unlockedAtPhase", () => {
    const connection = new LocationConnectionEntity();
    connection.isLocked = false;
    connection.unlockedAtPhase = 2;

    expect(connection.isAccessibleAtPhase(1)).toBe(false);
    expect(connection.isAccessibleAtPhase(2)).toBe(true);
  });
});
