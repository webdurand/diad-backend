import { hasVerbalSpellComponent } from "./spell-casting.service";

describe("spell components", () => {
  it.each([
    [["V"], true],
    [["S", "M"], false],
    ["V, S", true],
    [{ verbal: true, somatic: true }, true],
    [{ V: true }, true],
    [{ v: true }, true],
    [{ verbal: false, somatic: true }, false],
    [null, false],
  ])("detecta componente verbal em %p", (components, expected) => {
    expect(hasVerbalSpellComponent(components)).toBe(expected);
  });
});
