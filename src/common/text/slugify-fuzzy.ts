const STOP_WORDS = new Set([
  "de",
  "da",
  "do",
  "dos",
  "das",
  "e",
  "o",
  "a",
  "os",
  "as",
  "um",
  "uma",
  "of",
  "the",
  "and",
  "at",
  "in",
]);

const COMBINING_DIACRITICS = /[̀-ͯ]/g;
const NON_ALNUM = /[^a-z0-9]+/;

/**
 * Mesma lógica do `_slugify` em `diad-agents/src/agents/quest_judge.py`:
 * lowercase + sem acentos + sem stop-words + tokens unidos por hífen. Permite
 * comparar nome canônico ("Aldeia Tamoio de Itapema") contra slug sintetizado
 * por outras camadas ("aldeia_tamoio_itapema").
 */
export function slugifyFuzzy(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = value
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase();
  const tokens = normalized
    .split(NON_ALNUM)
    .filter((t) => t && !STOP_WORDS.has(t));
  return tokens.join("-");
}
