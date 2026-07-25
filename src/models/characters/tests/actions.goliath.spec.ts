import { ActionsService } from "../services/actions.service";

describe("ActionsService — Goliath traits", () => {
  function build(
    totalLevel: number,
    used = 0,
    raceTraitChoices: string[] = [],
    ancestryUsed = 0,
  ) {
    const service = Object.create(ActionsService.prototype) as ActionsService;
    const out: Array<Record<string, unknown>> = [];
    (service as any).buildRaceTraitActions(
      {
        character_origin: {
          race: { slug: "goliath" },
          race_trait_choices: raceTraitChoices,
        },
      },
      {
        feature_uses_used: {
          "large-form": used,
          "giant-ancestry": ancestryUsed,
        },
      },
      totalLevel,
      6,
      () => 0,
      out,
    );
    return out;
  }

  it("oferece Forma Grande a partir do nível 5 com um uso por descanso longo", () => {
    expect(build(4)).toEqual([]);
    expect(build(5)).toContainEqual(
      expect.objectContaining({
        id: "large-form",
        featureSlug: "large-form",
        timing: "bonus_action",
        sourceLabel: "Golias",
        uses: 1,
        usesMax: 1,
        usesRecharge: "long_rest",
      }),
    );
  });

  it("reflete o uso persistido na disponibilidade da ação", () => {
    expect(build(20, 1)).toContainEqual(
      expect.objectContaining({
        id: "large-form",
        uses: 0,
        usesMax: 1,
      }),
    );
  });

  it("oferece Salto das Nuvens com usos compartilhados pelo bônus de proficiência", () => {
    expect(build(20, 0, ["Cloud's Jaunt"], 2)).toContainEqual(
      expect.objectContaining({
        id: "clouds-jaunt",
        featureSlug: "clouds-jaunt",
        timing: "bonus_action",
        range: "30 ft",
        uses: 4,
        usesMax: 6,
      }),
    );
  });

  it("não expõe como ações os benefícios reativos da ancestralidade", () => {
    expect(build(20, 0, ["Fire's Burn"])).not.toContainEqual(
      expect.objectContaining({
        featureSlug: "fires-burn",
      }),
    );
  });
});
