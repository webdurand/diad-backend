import { parseEntries, parseEntriesAsText } from "./entries-parser";

describe("parseEntries", () => {
  describe("plain strings", () => {
    it("returns plain text as-is", () => {
      expect(parseEntries(["Hello world"])).toEqual(["Hello world"]);
    });

    it("strips tags from plain strings", () => {
      expect(parseEntries(["You cast {@spell Fireball|XPHB}"])).toEqual([
        "You cast Fireball",
      ]);
    });

    it("handles multiple plain strings", () => {
      expect(parseEntries(["Line 1", "Line 2", "Line 3"])).toEqual([
        "Line 1",
        "Line 2",
        "Line 3",
      ]);
    });
  });

  describe("nested entries", () => {
    it("parses named entries block", () => {
      const result = parseEntries([
        {
          type: "entries",
          name: "Feature Name",
          entries: ["Nested text...", "More text"],
        },
      ]);
      expect(result).toEqual([
        "**Feature Name**",
        "Nested text...",
        "More text",
      ]);
    });

    it("parses entries without name", () => {
      const result = parseEntries([
        {
          type: "entries",
          entries: ["Just text"],
        },
      ]);
      expect(result).toEqual(["Just text"]);
    });

    it("parses deeply nested entries", () => {
      const result = parseEntries([
        {
          type: "entries",
          name: "Outer",
          entries: [
            {
              type: "entries",
              name: "Inner",
              entries: ["Deep text"],
            },
          ],
        },
      ]);
      expect(result).toEqual(["**Outer**", "**Inner**", "Deep text"]);
    });
  });

  describe("lists", () => {
    it("parses simple list", () => {
      const result = parseEntries([
        {
          type: "list",
          items: ["item 1", "item 2"],
        },
      ]);
      expect(result).toEqual(["- item 1", "- item 2"]);
    });

    it("parses list with hang-notitle items", () => {
      const result = parseEntries([
        {
          type: "list",
          style: "list-hang-notitle",
          items: [
            {
              type: "item",
              name: "Label:",
              entries: ["description text"],
            },
          ],
        },
      ]);
      expect(result).toEqual(["- **Label:** description text"]);
    });

    it("parses list with item having entry field", () => {
      const result = parseEntries([
        {
          type: "list",
          items: [
            {
              type: "item",
              name: "Speed:",
              entry: "30 ft.",
            },
          ],
        },
      ]);
      expect(result).toEqual(["- **Speed:** 30 ft."]);
    });
  });

  describe("tables", () => {
    it("parses table with caption and data", () => {
      const result = parseEntries([
        {
          type: "table",
          caption: "Table Name",
          colLabels: ["Col1", "Col2"],
          rows: [["val1", "val2"]],
        },
      ]);
      expect(result).toEqual([
        "**Table Name**",
        "| Col1 | Col2 |",
        "| --- | --- |",
        "| val1 | val2 |",
      ]);
    });

    it("parses table without caption", () => {
      const result = parseEntries([
        {
          type: "table",
          colLabels: ["A", "B"],
          rows: [
            ["1", "2"],
            ["3", "4"],
          ],
        },
      ]);
      expect(result).toEqual([
        "| A | B |",
        "| --- | --- |",
        "| 1 | 2 |",
        "| 3 | 4 |",
      ]);
    });

    it("strips tags inside table cells", () => {
      const result = parseEntries([
        {
          type: "table",
          colLabels: ["Spell"],
          rows: [["{@spell Fireball|XPHB}"]],
        },
      ]);
      expect(result).toContain("| Fireball |");
    });
  });

  describe("inset blocks", () => {
    it("parses inset with name", () => {
      const result = parseEntries([
        {
          type: "inset",
          name: "Sidebar",
          entries: ["Some sidebar content."],
        },
      ]);
      expect(result).toEqual(["**Sidebar**", "Some sidebar content."]);
    });
  });

  describe("abilityDc", () => {
    it("generates ability DC text", () => {
      const result = parseEntries([
        {
          type: "abilityDc",
          name: "Spell",
          attributes: ["int"],
        },
      ]);
      expect(result).toEqual([
        "**Spell save DC** = 8 + your proficiency bonus + your Intelligence modifier",
      ]);
    });
  });

  describe("abilityAttackMod", () => {
    it("generates ability attack modifier text", () => {
      const result = parseEntries([
        {
          type: "abilityAttackMod",
          name: "Spell",
          attributes: ["int"],
        },
      ]);
      expect(result).toEqual([
        "**Spell attack modifier** = your proficiency bonus + your Intelligence modifier",
      ]);
    });
  });

  describe("quote blocks", () => {
    it("parses quote with author", () => {
      const result = parseEntries([
        {
          type: "quote",
          entries: ["Some wise words."],
          by: "Gandalf",
        },
      ]);
      expect(result).toEqual(["> Some wise words.", "> \u2014 Gandalf"]);
    });
  });

  describe("mixed entries", () => {
    it("handles a complex mixed array", () => {
      const result = parseEntries([
        "Plain text with {@spell Fireball} tags",
        {
          type: "entries",
          name: "Feature Name",
          entries: ["Nested text...", "More text"],
        },
        {
          type: "list",
          items: ["item 1", "item 2"],
        },
      ]);

      expect(result).toEqual([
        "Plain text with Fireball tags",
        "**Feature Name**",
        "Nested text...",
        "More text",
        "- item 1",
        "- item 2",
      ]);
    });
  });

  describe("parseEntriesAsText", () => {
    it("joins lines with newlines", () => {
      const result = parseEntriesAsText(["Line 1", "Line 2"]);
      expect(result).toBe("Line 1\nLine 2");
    });
  });
});
