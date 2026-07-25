import {
  createWitchBoltTether,
  findWitchBoltTether,
  witchBoltDistanceFt,
} from "./witch-bolt";

describe("Witch Bolt 2024", () => {
  it("mantém o alvo conectado mesmo quando o ataque inicial erra", () => {
    const tether = createWitchBoltTether("target-1", "Dragão Azul", 3);
    const found = findWitchBoltTether({
      isConcentrating: true,
      concentratingOn: "witch-bolt",
      appliedEffects: [tether],
    } as never);

    expect(found).toMatchObject({
      targetParticipantId: "target-1",
      targetName: "Dragão Azul",
      rangeFt: 60,
      createdRound: 3,
    });
  });

  it("não expõe vínculo quando a concentração terminou", () => {
    const tether = createWitchBoltTether("target-1", "Dragão Azul", 3);
    expect(
      findWitchBoltTether({
        isConcentrating: false,
        concentratingOn: undefined,
        appliedEffects: [tether],
      } as never),
    ).toBeNull();
  });

  it("mede o alcance pelo grid de 5 pés", () => {
    expect(
      witchBoltDistanceFt(
        { positionX: 2, positionY: 2 } as never,
        { positionX: 14, positionY: 10 } as never,
      ),
    ).toBe(60);
  });
});
