/**
 * Spec 024 follow-up — coletor incremental de narração a partir de stream SSE
 * passthrough do diad-agents. Reúne `content`/`token`/`text` dos eventos
 * `type ∈ {text, narration, narration_token, token}` para persistir como
 * `session_messages.kind=narration` server-side, sem depender do cliente.
 *
 * Uso típico (acoplado ao callback `onChunk` do AiProxyService.pipeStream):
 *
 *   const collector = new SseNarrationCollector();
 *   await aiProxyService.pipeStream(path, body, res, (c) => collector.feed(c));
 *   const narration = collector.finalize();
 *
 * Aceita chunks parciais (split mid-event) e múltiplos eventos por chunk.
 * Tolerante a JSON malformado e tipos desconhecidos — apenas ignora.
 */

const NARRATION_TYPES = new Set([
  "text",
  "narration",
  "narration_token",
  "token",
  // Spec 026 Pillar 4 — pipeline multi-agent emite chunks tipo `narrator`
  // (vide diad-agents/src/routers/narrative.py). Tratamos igual a `text`
  // pra que persistência server-authoritative cubra ambos os pipelines.
  "narrator",
]);

export interface CollectedChoice {
  id: string;
  label: string;
  icon?: string;
  intentHint?: string;
}

export class SseNarrationCollector {
  private buffer = "";
  private narration = "";
  private choices: CollectedChoice[] = [];

  feed(chunk: string | Buffer): void {
    const data = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    this.buffer += data;
    let newlineIdx = this.buffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const line = this.buffer.slice(0, newlineIdx);
      this.buffer = this.buffer.slice(newlineIdx + 1);
      this.processLine(line);
      newlineIdx = this.buffer.indexOf("\n");
    }
  }

  finalize(): string {
    if (this.buffer.length > 0) {
      this.processLine(this.buffer);
      this.buffer = "";
    }
    return this.narration;
  }

  /** Última lista de choices emitida pelo upstream (pode estar vazia). */
  getChoices(): CollectedChoice[] {
    return this.choices;
  }

  private processLine(line: string): void {
    const trimmed = line.replace(/\r$/, "").trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const ev = parsed as {
      type?: unknown;
      content?: unknown;
      token?: unknown;
      text?: unknown;
      choices?: unknown;
    };
    if (typeof ev.type !== "string") return;

    if (ev.type === "choices" && Array.isArray(ev.choices)) {
      const collected: CollectedChoice[] = [];
      for (const raw of ev.choices) {
        if (!raw || typeof raw !== "object") continue;
        const c = raw as Record<string, unknown>;
        const id = typeof c.id === "string" ? c.id : "";
        const label = typeof c.label === "string" ? c.label : "";
        if (!id || !label) continue;
        collected.push({
          id,
          label,
          icon: typeof c.icon === "string" ? c.icon : undefined,
          intentHint: typeof c.intentHint === "string" ? c.intentHint : undefined,
        });
      }
      // Última lista emitida ganha (turn pode emitir sentinel + final).
      if (collected.length > 0) this.choices = collected;
      return;
    }

    if (!NARRATION_TYPES.has(ev.type)) return;
    const piece =
      typeof ev.content === "string"
        ? ev.content
        : typeof ev.token === "string"
        ? ev.token
        : typeof ev.text === "string"
        ? ev.text
        : "";
    if (piece) this.narration += piece;
  }
}
