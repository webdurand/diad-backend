

export const DOMAIN_HEADER = "x-diad-domain";

export const DOMAIN_KEYS = [
  "campaign.id",
  "session.id",
  "pc.id",
  "user.id",
  "turn.id",
  "encounter.id",
  "scene.id",
  "feature.name",
  "scene.type",
  "turn.number",
] as const;

export type DomainKey = (typeof DOMAIN_KEYS)[number];

export type DomainContext = Partial<Record<DomainKey, string>>;

const ALLOWED = new Set<string>(DOMAIN_KEYS);
const MAX_VALUE_LEN = 64;


export function parseDomainHeader(
  header: string | string[] | undefined,
): DomainContext {
  if (!header) return {};
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== "string" || !raw.length) return {};

  const out: DomainContext = {};
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!ALLOWED.has(key)) continue;
    if (!value) continue;
    out[key as DomainKey] = value.slice(0, MAX_VALUE_LEN);
  }
  return out;
}


export function serializeDomainHeader(ctx: DomainContext): string {
  const pairs: string[] = [];
  for (const key of DOMAIN_KEYS) {
    const v = ctx[key];
    if (typeof v !== "string" || !v.length) continue;
    pairs.push(`${key}=${v.slice(0, MAX_VALUE_LEN)}`);
  }
  return pairs.join(";");
}
