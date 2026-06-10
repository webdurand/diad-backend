import {
  downtimeArchetypeForChaosFactor,
  downtimeTurnsForArchetype,
  type DowntimeTurnDraft,
} from "../domain/narrative-memory.types";

export interface DowntimeRepositoryPort {
  saveTurns(turns: DowntimeTurnDraft[]): Promise<DowntimeTurnDraft[]>;
}

export interface DowntimeEventPort {
  publishDowntimeExecuted(input: {
    sessionId: string;
    campaignId?: string | null;
    phaseTransitionId: string;
    turnsCount: number;
    archetypeChosen: "expected" | "altered" | "interrupt";
    chaosFactor: number;
    traceId?: string;
  }): Promise<void>;
}

export interface EvolveDowntimeInput {
  sessionId: string;
  campaignId?: string | null;
  phaseTransitionId: string;
  chaosFactor: number;
  traceId?: string;
}

export interface EvolveDowntimeResult {
  archetypeChosen: "expected" | "altered" | "interrupt";
  turns: DowntimeTurnDraft[];
}

export class EvolveDowntimeUseCase {
  constructor(
    private readonly deps: {
      repository: DowntimeRepositoryPort;
      events: DowntimeEventPort;
    },
  ) {}

  async execute(input: EvolveDowntimeInput): Promise<EvolveDowntimeResult> {
    const archetypeChosen = downtimeArchetypeForChaosFactor(input.chaosFactor);
    const turnsCount = downtimeTurnsForArchetype(archetypeChosen);
    const turns = Array.from({ length: turnsCount }, (_, index) => ({
      gameSessionId: input.sessionId,
      phaseTransitionId: input.phaseTransitionId,
      turnIndex: index + 1,
      archetypeChosen,
      chaosFactor: input.chaosFactor,
      narrativeText: buildDowntimeNarrative(archetypeChosen, index + 1),
      status: "ready" as const,
      metadata: { generatedBy: "EvolveDowntimeUseCase" },
    }));

    const saved = await this.deps.repository.saveTurns(turns);
    await this.deps.events.publishDowntimeExecuted({
      sessionId: input.sessionId,
      campaignId: input.campaignId ?? null,
      phaseTransitionId: input.phaseTransitionId,
      turnsCount: saved.length,
      archetypeChosen,
      chaosFactor: input.chaosFactor,
      traceId: input.traceId,
    });

    return { archetypeChosen, turns: saved };
  }
}

function buildDowntimeNarrative(
  archetype: "expected" | "altered" | "interrupt",
  turnIndex: number,
): string {
  if (archetype === "expected") {
    return `Downtime ${turnIndex}: o mundo respira antes da próxima fase.`;
  }
  if (archetype === "altered") {
    return `Downtime ${turnIndex}: um detalhe fora do lugar muda a leitura da vitória.`;
  }
  return `Downtime ${turnIndex}: a próxima urgência invade antes do descanso acabar.`;
}
