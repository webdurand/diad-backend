const XPHB_SOURCES = new Set(["XPHB", "SRD52"]);

export function generateSlug(
  name: string,
  source: string,
  srd52?: boolean,
): string {
  const base = toKebab(name);
  const isXphb = srd52 || XPHB_SOURCES.has(source.toUpperCase());
  return isXphb ? base : `${base}-${source.toLowerCase()}`;
}

function toKebab(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/['']/g, "") // remove apostrophes
    .replace(/[^a-z0-9]+/g, "-") // non-alnum to hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}
