import { deriveSceneMode, type SceneMode } from "./scene-mode";

describe("deriveSceneMode", () => {
  const cases: Array<{
    activeEncounterId: string | null | undefined;
    travelActive: boolean | null | undefined;
    currentInterlocutorNpcId: string | null | undefined;
    expected: SceneMode;
  }> = [
    { activeEncounterId: "enc-1", travelActive: true, currentInterlocutorNpcId: "npc-1", expected: "combat" },
    { activeEncounterId: "enc-1", travelActive: true, currentInterlocutorNpcId: null, expected: "combat" },
    { activeEncounterId: "enc-1", travelActive: false, currentInterlocutorNpcId: "npc-1", expected: "combat" },
    { activeEncounterId: "enc-1", travelActive: false, currentInterlocutorNpcId: null, expected: "combat" },
    { activeEncounterId: "enc-1", travelActive: null, currentInterlocutorNpcId: "npc-1", expected: "combat" },
    { activeEncounterId: "enc-1", travelActive: null, currentInterlocutorNpcId: null, expected: "combat" },
    { activeEncounterId: null, travelActive: true, currentInterlocutorNpcId: "npc-1", expected: "travel" },
    { activeEncounterId: null, travelActive: true, currentInterlocutorNpcId: null, expected: "travel" },
    { activeEncounterId: undefined, travelActive: true, currentInterlocutorNpcId: "npc-1", expected: "travel" },
    { activeEncounterId: undefined, travelActive: true, currentInterlocutorNpcId: null, expected: "travel" },
    { activeEncounterId: null, travelActive: false, currentInterlocutorNpcId: "npc-1", expected: "dialogue" },
    { activeEncounterId: undefined, travelActive: false, currentInterlocutorNpcId: "npc-1", expected: "dialogue" },
    { activeEncounterId: null, travelActive: null, currentInterlocutorNpcId: "npc-1", expected: "dialogue" },
    { activeEncounterId: null, travelActive: false, currentInterlocutorNpcId: null, expected: "open" },
    { activeEncounterId: undefined, travelActive: false, currentInterlocutorNpcId: undefined, expected: "open" },
    { activeEncounterId: null, travelActive: null, currentInterlocutorNpcId: null, expected: "open" },
  ];

  it.each(cases)(
    "returns $expected for encounter=$activeEncounterId travel=$travelActive interlocutor=$currentInterlocutorNpcId",
    ({ activeEncounterId, travelActive, currentInterlocutorNpcId, expected }) => {
      expect(
        deriveSceneMode(
          {
            activeEncounterId,
            travelState: travelActive == null ? null : { active: travelActive },
          },
          { currentInterlocutorNpcId },
        ),
      ).toBe(expected);
    },
  );
});
