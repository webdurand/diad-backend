import type { RecapStatus } from "src/models/session/services/session-recap.service";

export interface PreviouslyOnResult {
  prose: string;
  source: "cache" | "hot_recap" | "rewrapped";
}

export class BuildPreviouslyOnUseCase {
  constructor(
    private readonly recapService: {
      ensureRecap(sessionId: string): Promise<RecapStatus>;
    },
  ) {}

  async execute(input: { sessionId: string }): Promise<PreviouslyOnResult | null> {
    const recap = await this.recapService.ensureRecap(input.sessionId);
    if (recap.status !== "cached" && recap.status !== "generated") {
      return null;
    }

    return {
      prose: rewrapPreviouslyOn(recap.summaryText),
      source: recap.status === "cached" ? "cache" : "hot_recap",
    };
  }
}

function rewrapPreviouslyOn(summaryText: string): string {
  const trimmed = summaryText.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Anteriormente, a aventura deixou uma pergunta em aberto.";
  if (/^anteriormente[,.:]/i.test(trimmed)) return trimmed;
  return `Anteriormente, ${trimmed}`;
}
