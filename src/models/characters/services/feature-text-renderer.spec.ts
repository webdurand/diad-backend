import {
  renderFeatureDescription,
  extractNarrativeDescriptor,
} from "./feature-text-renderer";

describe("renderFeatureDescription", () => {
  describe("scalars + empty", () => {
    it('null/undefined → ""', () => {
      expect(renderFeatureDescription(null)).toBe("");
      expect(renderFeatureDescription(undefined)).toBe("");
    });

    it("string direto → trimmed", () => {
      expect(renderFeatureDescription("  hello  ")).toBe("hello");
    });

    it('empty object → ""', () => {
      expect(renderFeatureDescription({})).toBe("");
    });
  });

  describe("p shape", () => {
    it('{p:"..."} → p', () => {
      expect(renderFeatureDescription({ p: "Rage begins." })).toBe(
        "Rage begins.",
      );
    });

    it('{p:[{p:"a"},{p:"b"}]} → joined with blank line', () => {
      expect(
        renderFeatureDescription({
          p: [{ p: "first" }, { p: "second" }],
        }),
      ).toBe("first\n\nsecond");
    });
  });

  describe("text shape (SRD tipical)", () => {
    it('{text:[{p:"..."}]} → renders nested', () => {
      const raw = { text: [{ p: "Action Surge grants an extra action." }] };
      expect(renderFeatureDescription(raw)).toBe(
        "Action Surge grants an extra action.",
      );
    });

    it('{text:[{p:"a"},{p:"b"}]} → joined', () => {
      expect(
        renderFeatureDescription({
          text: [{ p: "para 1" }, { p: "para 2" }],
        }),
      ).toBe("para 1\n\npara 2");
    });
  });

  describe("list shape", () => {
    it('{list:{items:["a","b"]}} → bullets', () => {
      expect(
        renderFeatureDescription({
          list: { items: ["alpha", "beta"] },
        }),
      ).toBe("• alpha\n• beta");
    });

    it('{list:["a","b"]} (array form) → bullets', () => {
      expect(renderFeatureDescription({ list: ["x", "y"] })).toBe("• x\n• y");
    });

    it("{bullets:[...]} alternative form → bullets", () => {
      expect(renderFeatureDescription({ bullets: ["p", "q"] })).toBe(
        "• p\n• q",
      );
    });

    it('{bullet:"single"} → single bullet', () => {
      expect(renderFeatureDescription({ bullet: "solo" })).toBe("• solo");
    });
  });

  describe("table shape", () => {
    it("{table:{headers, rows}} → pipe-separated", () => {
      expect(
        renderFeatureDescription({
          table: {
            headers: ["Level", "Bonus"],
            rows: [
              ["1", "+2"],
              ["5", "+3"],
            ],
          },
        }),
      ).toBe("Level | Bonus\n1 | +2\n5 | +3");
    });

    it("{table:{caption, headers, rows}} → caption first", () => {
      expect(
        renderFeatureDescription({
          table: {
            caption: "Rage Damage",
            headers: ["Level", "Dmg"],
            rows: [["1", "+2"]],
          },
        }),
      ).toBe("Rage Damage\nLevel | Dmg\n1 | +2");
    });
  });

  describe("nested/complex shapes", () => {
    it("SRD real: p + list mixed", () => {
      const raw = {
        text: [
          { p: "You get the following benefits:" },
          { list: { items: ["benefit A", "benefit B"] } },
        ],
      };
      expect(renderFeatureDescription(raw)).toBe(
        "You get the following benefits:\n\n• benefit A\n• benefit B",
      );
    });

    it("nested list inside text", () => {
      const raw = {
        text: [
          { p: "Intro" },
          {
            list: {
              items: [{ p: "first inner" }, "second inner"],
            },
          },
        ],
      };
      expect(renderFeatureDescription(raw)).toBe(
        "Intro\n\n• first inner\n• second inner",
      );
    });

    it("array at top level", () => {
      expect(
        renderFeatureDescription([{ p: "a" }, { p: "b" }, { p: "c" }]),
      ).toBe("a\n\nb\n\nc");
    });
  });

  describe("unknown shapes fallback", () => {
    it('{summary:"..."} → summary', () => {
      expect(renderFeatureDescription({ summary: "short" })).toBe("short");
    });

    it('{body:"..."} → body', () => {
      expect(renderFeatureDescription({ body: "long" })).toBe("long");
    });

    it('{content:{p:"nested"}} → nested render', () => {
      expect(renderFeatureDescription({ content: { p: "deep" } })).toBe("deep");
    });

    it('shape totalmente desconhecido → ""', () => {
      expect(renderFeatureDescription({ fooBar: 42 })).toBe("");
    });
  });

  it("filters empty children (não insere separadores vazios)", () => {
    expect(
      renderFeatureDescription([
        { p: "real content" },
        {},
        null,
        { p: "" },
        { p: "more content" },
      ]),
    ).toBe("real content\n\nmore content");
  });
});

describe("extractNarrativeDescriptor", () => {
  it('empty → ""', () => {
    expect(extractNarrativeDescriptor(null)).toBe("");
    expect(extractNarrativeDescriptor({})).toBe("");
  });

  it("short single sentence → returned as-is", () => {
    const raw = { p: "Rage begins as a bonus action." };
    expect(extractNarrativeDescriptor(raw)).toBe(
      "Rage begins as a bonus action.",
    );
  });

  it("picks first sentence from multi-sentence paragraph", () => {
    const raw = {
      p: "Action Surge grants an extra action. It recovers on short rest. More detail follows.",
    };
    expect(extractNarrativeDescriptor(raw)).toBe(
      "Action Surge grants an extra action.",
    );
  });

  it("truncates long single sentence with word boundary + ellipsis", () => {
    const raw = {
      p: "This is a very very long sentence that has no punctuation for many many words and eventually should be truncated at word boundary",
    };
    const out = extractNarrativeDescriptor(raw, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("…")).toBe(true);
    // Corte respeita fronteira de palavra: última palavra antes do '…' existe completa.
    const beforeEllipsis = out.slice(0, -1);
    expect(raw.p.startsWith(beforeEllipsis)).toBe(true);
  });

  it("respects custom maxChars", () => {
    const raw = { p: "A".repeat(200) };
    const out = extractNarrativeDescriptor(raw, 30);
    expect(out.length).toBeLessThanOrEqual(30);
  });

  it("uses first sentence even when whole text is long", () => {
    const raw = {
      text: [
        { p: "Short intro sentence here." },
        {
          p: "Much longer second paragraph with lots of words and complex grammar.",
        },
      ],
    };
    expect(extractNarrativeDescriptor(raw, 120)).toBe(
      "Short intro sentence here.",
    );
  });

  it("list shape → picks from rendered text", () => {
    const raw = {
      list: { items: ["First benefit with clear boundary.", "second"] },
    };
    const out = extractNarrativeDescriptor(raw, 120);
    expect(out).toContain("First benefit");
  });
});
