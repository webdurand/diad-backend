/**
 * Spec 015 Eixo 1 — renderizador puro de descrição SRD em texto plano.
 *
 * Features do SRD vêm com `description` em JSONB com shape recursivo
 * `{ text: [{p: "..."}, {list: {items: [...]}}, {table: {rows: [...]}}] }`.
 * A UI precisa de uma string legível (não o JSON cru).
 *
 * Este helper é puro (zero IO), 100% testável, e cobre todos os shapes
 * observados em `5e-SRD-Features.json` e `5e-SRD-Spells.json`.
 */

export type SrdText =
  | string
  | { p?: string | SrdText[]; text?: SrdText | SrdText[] }
  | { list?: { items?: SrdText[] } | SrdText[] }
  | { table?: { headers?: SrdText[]; rows?: SrdText[][]; caption?: string } }
  | { bullets?: SrdText[] }
  | { bullet?: string | SrdText }
  | Record<string, unknown>;

/**
 * Converte `description` do SRD num string legível. Shapes desconhecidos
 * retornam `''` (nunca `undefined`); objeto raw bem-formado não quebra.
 */
export function renderFeatureDescription(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) {
    return raw
      .map((n) => renderFeatureDescription(n))
      .filter((s) => s.length > 0)
      .join("\n\n");
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;

    if (typeof obj.p === "string") return obj.p.trim();
    if (Array.isArray(obj.p)) return renderFeatureDescription(obj.p);

    if ("text" in obj) {
      return renderFeatureDescription(obj.text);
    }

    if (obj.list) {
      const listNode = obj.list as { items?: SrdText[] } | SrdText[];
      const items = Array.isArray(listNode) ? listNode : (listNode.items ?? []);
      return items
        .map((it) => `• ${renderFeatureDescription(it)}`)
        .filter((s) => s.length > 2)
        .join("\n");
    }

    if (Array.isArray(obj.bullets)) {
      return obj.bullets
        .map((it) => `• ${renderFeatureDescription(it)}`)
        .filter((s) => s.length > 2)
        .join("\n");
    }

    if (obj.bullet != null) {
      const bulletText =
        typeof obj.bullet === "string"
          ? obj.bullet
          : renderFeatureDescription(obj.bullet);
      return `• ${bulletText}`;
    }

    if (obj.table) {
      const t = obj.table as {
        headers?: SrdText[];
        rows?: SrdText[][];
        caption?: string;
      };
      const lines: string[] = [];
      if (t.caption) lines.push(t.caption);
      if (t.headers)
        lines.push(t.headers.map(renderFeatureDescription).join(" | "));
      for (const row of t.rows ?? []) {
        lines.push(row.map(renderFeatureDescription).join(" | "));
      }
      return lines.filter((l) => l.length > 0).join("\n");
    }

    if (obj.paragraphs && Array.isArray(obj.paragraphs)) {
      return renderFeatureDescription(obj.paragraphs);
    }

    // Shape desconhecido — colecta chaves de texto conhecidas
    const known = ["summary", "body", "content", "value", "description"];
    for (const k of known) {
      if (k in obj) return renderFeatureDescription(obj[k]);
    }

    return "";
  }
  return "";
}

/**
 * Extrai uma descrição curta (≤ maxChars) pro `narrativeDescriptor`. Pega
 * a primeira frase do texto renderizado; se for maior que maxChars, trunca
 * em limite de palavra e adiciona reticências.
 */
export function extractNarrativeDescriptor(
  description: unknown,
  maxChars = 120,
): string {
  const full = renderFeatureDescription(description);
  if (!full) return "";

  const firstSentenceMatch = full.match(/^[^.!?\n]{10,}[.!?](?:\s|$)/);
  const candidate = firstSentenceMatch ? firstSentenceMatch[0].trim() : full;

  if (candidate.length <= maxChars) return candidate;

  const cut = candidate.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const safe = lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${safe.trim()}…`;
}
