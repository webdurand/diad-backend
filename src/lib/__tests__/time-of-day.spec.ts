import { computeTimeOfDay } from "../time-of-day";

function dt(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 0, 15, hour, minute, 0));
}

describe("computeTimeOfDay", () => {
  describe("default sunrise 06:00 / sunset 18:00", () => {
    it.each([
      [dt(0, 0), "midnight"],
      [dt(5, 29), "midnight"],
      [dt(5, 30), "dawn"],
      [dt(6, 0), "dawn"],
      [dt(6, 29), "dawn"],
      [dt(6, 30), "morning"],
      [dt(11, 59), "morning"],
      [dt(12, 0), "afternoon"],
      [dt(17, 29), "afternoon"],
      [dt(17, 30), "dusk"],
      [dt(18, 0), "dusk"],
      [dt(18, 29), "dusk"],
      [dt(18, 30), "night"],
      [dt(23, 59), "night"],
    ])("%p → %s", (now, expected) => {
      expect(computeTimeOfDay(now, "06:00", "18:00")).toBe(expected);
    });
  });

  describe("custom sunrise 07:00 / sunset 19:00", () => {
    it("morning shifts forward", () => {
      expect(computeTimeOfDay(dt(7, 31), "07:00", "19:00")).toBe("morning");
      expect(computeTimeOfDay(dt(6, 0), "07:00", "19:00")).toBe("midnight");
    });
    it("dusk shifts forward", () => {
      expect(computeTimeOfDay(dt(18, 30), "07:00", "19:00")).toBe("dusk");
      expect(computeTimeOfDay(dt(19, 30), "07:00", "19:00")).toBe("night");
    });
  });

  it("rejects invalid HH:mm", () => {
    expect(() => computeTimeOfDay(dt(12), "25:00", "18:00")).toThrow(
      /Invalid HH:mm/,
    );
    expect(() => computeTimeOfDay(dt(12), "06:00", "ab:cd")).toThrow(
      /Invalid HH:mm/,
    );
  });
});
