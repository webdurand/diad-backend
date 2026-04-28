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
]);

export class SseNarrationCollector {
  private buffer = "";
  private narration = "";

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
    const ev = parsed as { type?: unknown; content?: unknown; token?: unknown; text?: unknown };
    if (typeof ev.type !== "string" || !NARRATION_TYPES.has(ev.type)) return;
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
