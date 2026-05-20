export type SceneMode = "open" | "dialogue" | "combat" | "travel";

export interface SceneModeSessionInput {
  activeEncounterId?: string | null;
  travelState?: { active?: boolean } | null;
}

export interface SceneModeSceneInput {
  currentInterlocutorNpcId?: string | null;
}

export function deriveSceneMode(
  session: SceneModeSessionInput | null | undefined,
  scene: SceneModeSceneInput | null | undefined,
): SceneMode {
  if (session?.activeEncounterId) return "combat";
  if (session?.travelState?.active === true) return "travel";
  if (scene?.currentInterlocutorNpcId) return "dialogue";
  return "open";
}
