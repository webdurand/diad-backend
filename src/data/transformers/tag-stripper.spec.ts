import { stripTags } from "./tag-stripper";

describe("stripTags", () => {
  it("returns empty string for null/undefined", () => {
    expect(stripTags(null as any)).toBe("");
    expect(stripTags(undefined as any)).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(stripTags("Hello world")).toBe("Hello world");
  });


  describe("reference tags", () => {
    it("{@spell} with source", () => {
      expect(stripTags("{@spell Fireball|XPHB}")).toBe("Fireball");
    });

    it("{@spell} without source", () => {
      expect(stripTags("{@spell Fireball}")).toBe("Fireball");
    });

    it("{@item}", () => {
      expect(stripTags("{@item Longsword|XPHB}")).toBe("Longsword");
    });

    it("{@creature}", () => {
      expect(stripTags("{@creature Goblin|XMM}")).toBe("Goblin");
    });

    it("{@condition}", () => {
      expect(stripTags("{@condition Blinded|XPHB}")).toBe("Blinded");
    });

    it("{@action}", () => {
      expect(stripTags("{@action Magic|XPHB}")).toBe("Magic");
    });

    it("{@skill}", () => {
      expect(stripTags("{@skill Stealth|XPHB}")).toBe("Stealth");
    });

    it("{@feat}", () => {
      expect(stripTags("{@feat Alert|XPHB}")).toBe("Alert");
    });

    it("{@race}", () => {
      expect(stripTags("{@race Elf|XPHB}")).toBe("Elf");
    });

    it("{@class}", () => {
      expect(stripTags("{@class Wizard|XPHB}")).toBe("Wizard");
    });

    it("{@background}", () => {
      expect(stripTags("{@background Acolyte|XPHB}")).toBe("Acolyte");
    });

    it("{@sense}", () => {
      expect(stripTags("{@sense Darkvision|XPHB}")).toBe("Darkvision");
    });

    it("{@optfeature}", () => {
      expect(stripTags("{@optfeature Agonizing Blast|XPHB}")).toBe(
        "Agonizing Blast",
      );
    });

    it("{@variantrule}", () => {
      expect(stripTags("{@variantrule Hit Points|XPHB}")).toBe("Hit Points");
    });

    it("{@language}", () => {
      expect(stripTags("{@language Common|XPHB}")).toBe("Common");
    });

    it("{@classFeature}", () => {
      expect(stripTags("{@classFeature Spellcasting|Wizard|XPHB|1}")).toBe(
        "Spellcasting",
      );
    });

    it("{@subclassFeature}", () => {
      expect(
        stripTags(
          "{@subclassFeature Channel Divinity|Cleric|XPHB|Life|XPHB|6}",
        ),
      ).toBe("Channel Divinity");
    });
  });


  describe("formatting tags", () => {
    it("{@b text} -> **text**", () => {
      expect(stripTags("{@b some bold}")).toBe("**some bold**");
    });

    it("{@bold text} -> **text**", () => {
      expect(stripTags("{@bold some bold}")).toBe("**some bold**");
    });

    it("{@i text} -> *text*", () => {
      expect(stripTags("{@i some italic}")).toBe("*some italic*");
    });

    it("{@italic text} -> *text*", () => {
      expect(stripTags("{@italic some italic}")).toBe("*some italic*");
    });

    it("{@s text} -> ~~text~~", () => {
      expect(stripTags("{@s strikethrough}")).toBe("~~strikethrough~~");
    });

    it("{@strike text} -> ~~text~~", () => {
      expect(stripTags("{@strike strikethrough}")).toBe("~~strikethrough~~");
    });

    it("{@u text} -> text (no formatting)", () => {
      expect(stripTags("{@u underlined}")).toBe("underlined");
    });
  });


  describe("dice tags", () => {
    it("{@damage 1d6}", () => {
      expect(stripTags("{@damage 1d6}")).toBe("1d6");
    });

    it("{@dice 2d4}", () => {
      expect(stripTags("{@dice 2d4}")).toBe("2d4");
    });

    it("{@dc 15}", () => {
      expect(stripTags("{@dc 15}")).toBe("DC 15");
    });

    it("{@hit +5}", () => {
      expect(stripTags("{@hit +5}")).toBe("+5");
    });

    it("{@d20 +3}", () => {
      expect(stripTags("{@d20 +3}")).toBe("+3");
    });

    it("{@scaledice} extracts first value", () => {
      expect(stripTags("{@scaledice 2d6|1-9|1d6}")).toBe("2d6");
    });

    it("{@scaledamage} extracts first value", () => {
      expect(stripTags("{@scaledamage 2d6|1-9|1d6}")).toBe("2d6");
    });

    it("{@chance 25} -> 25%", () => {
      expect(stripTags("{@chance 25}")).toBe("25%");
    });

    it("{@recharge 5} -> (Recharge 5-6)", () => {
      expect(stripTags("{@recharge 5}")).toBe("(Recharge 5-6)");
    });

    it("{@recharge 6} -> (Recharge 6)", () => {
      expect(stripTags("{@recharge 6}")).toBe("(Recharge 6)");
    });
  });


  describe("attack tags", () => {
    it("{@atk mw}", () => {
      expect(stripTags("{@atk mw}")).toBe("Melee Weapon Attack");
    });

    it("{@atk rw}", () => {
      expect(stripTags("{@atk rw}")).toBe("Ranged Weapon Attack");
    });

    it("{@atk ms}", () => {
      expect(stripTags("{@atk ms}")).toBe("Melee Spell Attack");
    });

    it("{@atk rs}", () => {
      expect(stripTags("{@atk rs}")).toBe("Ranged Spell Attack");
    });
  });


  describe("hit/miss markers", () => {
    it("{@h} -> Hit:", () => {
      expect(stripTags("{@h}")).toBe("Hit: ");
    });

    it("{@m} -> Miss:", () => {
      expect(stripTags("{@m}")).toBe("Miss: ");
    });
  });


  describe("reference/navigation tags", () => {
    it("{@filter}", () => {
      expect(stripTags("{@filter text|page|filters}")).toBe("text");
    });

    it("{@book}", () => {
      expect(stripTags("{@book text|DMG|ch|sec}")).toBe("text");
    });

    it("{@adventure}", () => {
      expect(stripTags("{@adventure text|CoS|ch}")).toBe("text");
    });

    it("{@note}", () => {
      expect(stripTags("{@note important text}")).toBe("important text");
    });

    it("{@footnote}", () => {
      expect(stripTags("{@footnote text|note}")).toBe("text");
    });

    it("{@5etools}", () => {
      expect(stripTags("{@5etools text|page.html}")).toBe("text");
    });

    it("{@quickref}", () => {
      expect(stripTags("{@quickref text|something}")).toBe("text");
    });
  });


  describe("misc tags", () => {
    it("{@sup}", () => {
      expect(stripTags("{@sup text}")).toBe("text");
    });

    it("{@sub}", () => {
      expect(stripTags("{@sub text}")).toBe("text");
    });

    it("{@code}", () => {
      expect(stripTags("{@code text}")).toBe("text");
    });

    it("{@color}", () => {
      expect(stripTags("{@color text|ff0000}")).toBe("text");
    });

    it("{@highlight}", () => {
      expect(stripTags("{@highlight text|ff0000}")).toBe("text");
    });
  });


  describe("2024 action tags", () => {
    it("{@actSave str}", () => {
      expect(stripTags("{@actSave str}")).toBe("Strength Saving Throw:");
    });

    it("{@actSave dex}", () => {
      expect(stripTags("{@actSave dex}")).toBe("Dexterity Saving Throw:");
    });

    it("{@actSaveFail text}", () => {
      expect(stripTags("{@actSaveFail The target takes damage}")).toBe(
        "Failure: The target takes damage",
      );
    });

    it("{@actSaveSuccess}", () => {
      expect(stripTags("{@actSaveSuccess}")).toBe("Success:");
    });

    it("{@actTrigger}", () => {
      expect(stripTags("{@actTrigger}")).toBe("Trigger:");
    });

    it("{@actResponse}", () => {
      expect(stripTags("{@actResponse}")).toBe("Response:");
    });

    it("{@dcYourSpellSave}", () => {
      expect(stripTags("{@dcYourSpellSave text}")).toBe("your spell save DC");
    });

    it("{@hitYourSpellAttack}", () => {
      expect(stripTags("{@hitYourSpellAttack text}")).toBe(
        "your spell attack modifier",
      );
    });
  });


  describe("mixed text with multiple tags", () => {
    it("handles text with inline tags", () => {
      const input =
        "You cast {@spell Fireball|XPHB} dealing {@damage 8d6} fire damage.";
      expect(stripTags(input)).toBe(
        "You cast Fireball dealing 8d6 fire damage.",
      );
    });

    it("handles multiple tags in sequence", () => {
      const input = "{@b Bold} and {@i italic} and {@spell Cure Wounds|XPHB}";
      expect(stripTags(input)).toBe("**Bold** and *italic* and Cure Wounds");
    });

    it("handles nested formatting with reference", () => {
      const input = "Make a {@dc 15} {@skill Athletics|XPHB} check";
      expect(stripTags(input)).toBe("Make a DC 15 Athletics check");
    });
  });
});
