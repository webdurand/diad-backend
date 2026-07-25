export type HalflingLuckReroll = {
  die: "normal" | "first" | "second";
  original: 1;
  rerolled: number;
};

type HalflingLuckSheet = {
  race?: { slug?: string };
  features?: Array<{ slug?: string; active?: boolean }>;
};

export function hasHalflingLuck(sheet: HalflingLuckSheet): boolean {
  const isHalfling =
    sheet.race?.slug?.toLowerCase().replace(/-(phb|xphb|srd52)$/i, "") ===
    "halfling";
  if (!isHalfling) return false;

  return (sheet.features ?? []).some((feature) => {
    const slug = feature.slug
      ?.toLowerCase()
      .replace(/-(phb|xphb|srd52)$/i, "");
    return feature.active !== false && (slug === "luck" || slug === "lucky");
  });
}

export function rollD20TestWithHalflingLuck(input: {
  enabled: boolean;
  advantage?: boolean;
  disadvantage?: boolean;
  roll: () => number;
}): {
  chosen: number;
  advantage?: {
    roll1: number;
    roll2: number;
    chosen: number;
    discarded: number;
  };
  rerolls: HalflingLuckReroll[];
} {
  const rerolls: HalflingLuckReroll[] = [];
  const rollOne = (die: HalflingLuckReroll["die"]) => {
    const original = input.roll();
    if (!input.enabled || original !== 1) return original;
    const rerolled = input.roll();
    rerolls.push({ die, original: 1, rerolled });
    return rerolled;
  };

  if (input.advantage || input.disadvantage) {
    const roll1 = rollOne("first");
    const roll2 = rollOne("second");
    const chosen = input.advantage
      ? Math.max(roll1, roll2)
      : Math.min(roll1, roll2);
    return {
      chosen,
      advantage: {
        roll1,
        roll2,
        chosen,
        discarded: roll1 === chosen ? roll2 : roll1,
      },
      rerolls,
    };
  }

  return {
    chosen: rollOne("normal"),
    rerolls,
  };
}
