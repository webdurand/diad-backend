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

/**
 * Shape persistido em `session_messages.content` quando kind='dice_roll'.
 * Espelha `DiceRollCardProps` do frontend — qualquer mudança aqui exige
 * acompanhar `diad-frontend/components/solo/DiceRollCard.tsx`.
 */
export interface CollectedDiceRoll {
  rollId: string;
  kind: string;
  ability: string | null;
  skill: string | null;
  dc: number;
  advantage: "normal" | "advantage" | "disadvantage";
  modifiers: Array<{ label: string; value: number }>;
  totalModifier: number;
  targetD20: number;
  narrativeFraming?: string;
  resolved?: {
    rawD20: number;
    rawD20Disadv: number | null;
    total: number;
    verdict: "success" | "failure" | "crit_success" | "crit_failure";
  };
}

function normalizeAdvantage(
  v: unknown,
): "normal" | "advantage" | "disadvantage" {
  if (v === "advantage" || v === true) return "advantage";
  if (v === "disadvantage") return "disadvantage";
  return "normal";
}

function verdictFromPreflight(
  rawD20: number,
  success: boolean,
): "success" | "failure" | "crit_success" | "crit_failure" {
  if (rawD20 === 20) return "crit_success";
  if (rawD20 === 1) return "crit_failure";
  return success ? "success" : "failure";
}

export class SseNarrationCollector {
  private buffer = "";
  private narration = "";
  private choices: CollectedChoice[] = [];
  private diceRolls = new Map<string, CollectedDiceRoll>();
  private preflightCounter = 0;
  private narratorDoneFired = false;
  private onNarratorDoneCb: ((narration: string) => void) | null = null;

  /** Registra callback chamado uma única vez quando o evento SSE
   * `narrator_done` é detectado. Permite persistir a narração antes do
   * `stream.end` (que aguarda Archivist + judges + decisions, ~30s).
   * Sem isso, lazy combat extract dispara com `session_messages` velho. */
  onNarratorDone(cb: (narration: string) => void): void {
    this.onNarratorDoneCb = cb;
  }

  /** Snapshot da narração acumulada até o momento (sem destruir buffer). */
  getNarration(): string {
    return this.narration;
  }

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

  /**
   * Rolls de skill check / saving throw / attack roll capturados do stream,
   * já com `resolved` populado. Rolls que ficaram pendentes (request sem
   * resolved) são omitidos pra não poluir o histórico com cards "rolando
   * pra sempre" no resume.
   */
  getDiceRolls(): CollectedDiceRoll[] {
    return Array.from(this.diceRolls.values()).filter(
      (r) => r.resolved !== undefined,
    );
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

    if (ev.type === "narrator_done" && !this.narratorDoneFired) {
      this.narratorDoneFired = true;
      const cb = this.onNarratorDoneCb;
      if (cb) {
        try {
          cb(this.narration);
        } catch {
          // Side-channel — nunca derrubar o stream.
        }
      }
      return;
    }

    if (ev.type === "dice_roll_request") {
      this.handleDiceRollRequest(parsed as Record<string, unknown>);
      return;
    }

    if (ev.type === "dice_roll_resolved") {
      this.handleDiceRollResolved(parsed as Record<string, unknown>);
      return;
    }

    if (ev.type === "preflight_rolls") {
      this.handlePreflightRolls(parsed as Record<string, unknown>);
      return;
    }

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

  private handleDiceRollRequest(ev: Record<string, unknown>): void {
    const rollId = typeof ev.rollId === "string" ? ev.rollId : null;
    if (!rollId) return;

    const modifiers = Array.isArray(ev.modifiers)
      ? (ev.modifiers as unknown[])
          .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
          .map((m) => ({
            label: typeof m.label === "string" ? m.label : "",
            value: typeof m.value === "number" ? m.value : 0,
          }))
      : [];

    const totalModifier =
      typeof ev.totalModifier === "number" ? ev.totalModifier : 0;
    const dc = typeof ev.dc === "number" ? ev.dc : 0;
    const targetD20 =
      typeof ev.targetD20 === "number"
        ? ev.targetD20
        : Math.max(1, dc - totalModifier);

    const existing = this.diceRolls.get(rollId);
    const resolved = existing?.resolved;
    this.diceRolls.set(rollId, {
      rollId,
      kind: typeof ev.kind === "string" ? ev.kind : "ability_check",
      ability: typeof ev.ability === "string" ? ev.ability : null,
      skill: typeof ev.skill === "string" ? ev.skill : null,
      dc,
      advantage: normalizeAdvantage(ev.advantage),
      modifiers,
      totalModifier,
      targetD20,
      narrativeFraming:
        typeof ev.narrativeFraming === "string"
          ? ev.narrativeFraming
          : undefined,
      ...(resolved ? { resolved } : {}),
    });
  }

  private handleDiceRollResolved(ev: Record<string, unknown>): void {
    const rollId = typeof ev.rollId === "string" ? ev.rollId : null;
    if (!rollId) return;
    const rawD20 = typeof ev.rawD20 === "number" ? ev.rawD20 : null;
    const total = typeof ev.total === "number" ? ev.total : null;
    const verdict =
      ev.verdict === "success" ||
      ev.verdict === "failure" ||
      ev.verdict === "crit_success" ||
      ev.verdict === "crit_failure"
        ? ev.verdict
        : null;
    if (rawD20 === null || total === null || !verdict) return;

    const existing = this.diceRolls.get(rollId);
    if (!existing) return; // resolved sem request prévio — ignora.
    existing.resolved = {
      rawD20,
      rawD20Disadv:
        typeof ev.rawD20Disadv === "number" ? ev.rawD20Disadv : null,
      total,
      verdict,
    };
  }

  private handlePreflightRolls(ev: Record<string, unknown>): void {
    const rolls = Array.isArray(ev.rolls) ? ev.rolls : [];
    for (const raw of rolls) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const dc = typeof r.dc === "number" ? r.dc : 15;
      const total = typeof r.total === "number" ? r.total : 0;
      const rawD20 = typeof r.rawD20 === "number" ? r.rawD20 : 10;
      const modifier = typeof r.modifier === "number" ? r.modifier : 0;
      const success = Boolean(r.success);
      const ability = typeof r.ability === "string" ? r.ability : null;
      const skill = typeof r.skill === "string" ? r.skill : null;
      const kindRaw = typeof r.kind === "string" ? r.kind : "skill_check";
      const kind =
        kindRaw === "saving_throw" ? "saving_throw" : "ability_check";

      const rollId = `preflight-srv-${Date.now()}-${this.preflightCounter++}`;
      this.diceRolls.set(rollId, {
        rollId,
        kind,
        ability,
        skill,
        dc,
        advantage: "normal",
        modifiers: [
          { label: skill ? skill : `${ability ?? "?"} mod`, value: modifier },
        ],
        totalModifier: modifier,
        targetD20: Math.max(1, dc - modifier),
        resolved: {
          rawD20,
          rawD20Disadv: null,
          total,
          verdict: verdictFromPreflight(rawD20, success),
        },
      });
    }
  }
}
