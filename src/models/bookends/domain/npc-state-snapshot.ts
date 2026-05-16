export interface NpcStateLike {
  npcId: string;
  status?: string | null;
  deathStatus?: string | null;
}

export function selectAliveNpcIds(states: NpcStateLike[]): string[] {
  return states
    .filter((state) => (state.deathStatus ?? state.status ?? "alive") !== "dead")
    .map((state) => state.npcId);
}

export function selectDeadNpcIds(states: NpcStateLike[]): string[] {
  return states
    .filter((state) => (state.deathStatus ?? state.status ?? "alive") === "dead")
    .map((state) => state.npcId);
}
