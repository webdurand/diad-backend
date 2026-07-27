interface RangerFeature {
  slug?: string;
  active?: boolean;
  sourceCode?: string;
}

interface RangerClass {
  slug?: string;
  level?: number;
}

interface RangerSheet {
  classes?: RangerClass[];
  features?: RangerFeature[];
}

function isPhbRangerAtLeast(
  classes: RangerClass[],
  requiredLevel: number,
): boolean {
  return classes.some((entry) => {
    const slug = entry.slug?.toLowerCase();
    return (
      (slug === "ranger" || slug === "ranger-phb") &&
      typeof entry.level === "number" &&
      entry.level >= requiredLevel
    );
  });
}

function hasExactActivePhbFeature(
  features: RangerFeature[],
  slug: string,
): boolean {
  return features.some(
    (feature) =>
      feature.active !== false &&
      feature.slug?.toLowerCase() === slug &&
      (!feature.sourceCode || feature.sourceCode.toUpperCase() === "PHB"),
  );
}

export function hasPhbFeralSenses(sheet: unknown): boolean {
  const rangerSheet = (sheet ?? {}) as RangerSheet;
  return (
    isPhbRangerAtLeast(rangerSheet.classes ?? [], 18) &&
    hasExactActivePhbFeature(
      rangerSheet.features ?? [],
      "feral-senses-ranger-18-phb",
    )
  );
}
