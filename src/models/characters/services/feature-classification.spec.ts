import {
  classifyFeatureForActions,
  type FeatureClassification,
} from "./feature-classification";

/**
 * Spec 015 Eixo 1 — classifica features do SRD para a aba de Ações.
 *
 * Pré-015: o `actions.service.buildFeatureActions` usava regex no description
 * para decidir se uma feature virava "action". Passivas puras (Song of Rest,
 * Expertise, Jack of All Trades) matcham no regex "use|activate" e vazam pra
 * aba Ações. Scalings (`bardic-inspiration-d8/d10/d12`) emitem 3 cards
 * idênticos em vez de 1 com o dado mais alto.
 *
 * Este helper é uma tabela curada com página PHB ao lado (Princípio II).
 */

describe("classifyFeatureForActions", () => {
  describe("hide — features passivas (Bardo)", () => {
    const bardPassives = [
      "song-of-rest-d6",
      "song-of-rest-d8",
      "song-of-rest-d10",
      "song-of-rest-d12",
      "jack-of-all-trades",
      "jack-of-all-trades-bard-2",
      "bard-expertise-1",
      "bard-expertise-2",
      "expertise-bard-2",
      "expertise-bard-9",
      "font-of-inspiration",
      "font-of-inspiration-bard-5",
      "superior-inspiration",
      "superior-inspiration-bard-18",
      "magical-secrets-1",
      "magical-secrets-2",
      "magical-secrets-3",
      "magical-secrets-bard-10",
      "additional-magical-secrets",
      "peerless-skill",
      "words-of-creation-bard-20",
      "bonus-proficiencies",
      "bard-college",
      "bard-subclass-bard-3",
      "bard-college-improvement-1",
      "bard-college-improvement-2",
      "subclass-feature-bard-6",
      "subclass-feature-bard-14",
      "epic-boon-bard-19",
    ];
    test.each(bardPassives)("%s → hide", (slug) => {
      expect(classifyFeatureForActions(slug)?.kind).toBe("hide");
    });
  });

  describe("hide — features passivas (Druida)", () => {
    const druidPassives = [
      // L18 + L20
      "archdruid",
      "druid-timeless-body",
      // Wild Shape scaling markers (CR unlocks são passive, apenas informacionais)
      "wild-shape-cr-1-4-or-below-no-flying-or-swim-speed",
      "wild-shape-cr-1-2-or-below-no-flying-speed",
      "wild-shape-cr-1-or-below",
      "wild-shape-improvements",
      // Spellcasting grants
      "druidic",
      "druidic-druid-1",
      "spellcasting-druid-1",
      // Druid Circle markers
      "druid-circle",
      "druid-subclass-druid-3",
      "druid-circle-improvement-1",
      "druid-circle-improvement-2",
      "subclass-feature-druid-6",
      "subclass-feature-druid-10",
      "subclass-feature-druid-14",
      "nature-s-sanctuary",
      "nature-s-ward",
      // ASI + Epic Boon
      "druid-ability-score-improvement-1",
      "druid-ability-score-improvement-2",
      "druid-ability-score-improvement-3",
      "druid-ability-score-improvement-4",
      "druid-ability-score-improvement-5",
      "ability-score-improvement-druid-4",
      "ability-score-improvement-druid-8",
      "ability-score-improvement-druid-12",
      "ability-score-improvement-druid-16",
      "ability-score-improvement-druid-19",
      "epic-boon-druid-19",
    ];
    test.each(druidPassives)("%s → hide", (slug) => {
      expect(classifyFeatureForActions(slug)?.kind).toBe("hide");
    });
  });

  describe("hide — padrões universais (regex)", () => {
    it("qualquer wild-shape-cr-* é passive marker (scaling CR unlock)", () => {
      const variants = [
        "wild-shape-cr-1-4",
        "wild-shape-cr-2",
        "wild-shape-cr-1-or-below-with-flying",
        "wild-shape-cr-unknown-future-variant",
      ];
      for (const v of variants) {
        expect(classifyFeatureForActions(v)?.kind).toBe("hide");
      }
    });

    it("qualquer *-ability-score-improvement-* é passive", () => {
      expect(
        classifyFeatureForActions("wizard-ability-score-improvement-3")?.kind,
      ).toBe("hide");
      expect(
        classifyFeatureForActions("ability-score-improvement-fighter-6")?.kind,
      ).toBe("hide");
      expect(
        classifyFeatureForActions("rogue-ability-score-improvement-4")?.kind,
      ).toBe("hide");
    });

    it("qualquer epic-boon-* é passive (L19 grant)", () => {
      expect(classifyFeatureForActions("epic-boon-cleric-19")?.kind).toBe(
        "hide",
      );
      expect(classifyFeatureForActions("epic-boon-paladin-19")?.kind).toBe(
        "hide",
      );
    });

    it("qualquer subclass-feature-*-{N} é marker (informational)", () => {
      expect(classifyFeatureForActions("subclass-feature-cleric-3")?.kind).toBe(
        "hide",
      );
      expect(
        classifyFeatureForActions("subclass-feature-wizard-14")?.kind,
      ).toBe("hide");
    });

    it("qualquer *-college-improvement-* ou *-circle-improvement-* é marker", () => {
      expect(
        classifyFeatureForActions("wizard-school-improvement-1")?.kind,
      ).toBe("hide");
      expect(
        classifyFeatureForActions("cleric-domain-improvement-2")?.kind,
      ).toBe("hide");
    });

    it("spellcasting base grants são passive", () => {
      expect(classifyFeatureForActions("spellcasting-wizard-1")?.kind).toBe(
        "hide",
      );
      expect(classifyFeatureForActions("spellcasting-cleric-1")?.kind).toBe(
        "hide",
      );
      expect(classifyFeatureForActions("pact-magic-warlock-1")?.kind).toBe(
        "hide",
      );
    });
  });

  describe("alias — scalings do Bardic Inspiration (regex)", () => {
    test.each([
      ["bardic-inspiration-bard-1", "bardic-inspiration"],
      ["bardic-inspiration-d8", "bardic-inspiration"],
      ["bardic-inspiration-d10", "bardic-inspiration"],
      ["bardic-inspiration-d12", "bardic-inspiration"],
    ])("%s → alias de %s", (slug, canonical) => {
      const c = classifyFeatureForActions(slug);
      expect(c?.kind).toBe("alias");
      expect(c?.canonicalSlug).toBe(canonical);
    });
  });

  describe("alias — Countercharm", () => {
    it("countercharm-bard-7 → alias de countercharm", () => {
      const c = classifyFeatureForActions("countercharm-bard-7");
      expect(c?.kind).toBe("alias");
      expect(c?.canonicalSlug).toBe("countercharm");
    });
    it("countercharm-bard-8 (regex pattern) → alias de countercharm", () => {
      const c = classifyFeatureForActions("countercharm-bard-8");
      expect(c?.kind).toBe("alias");
      expect(c?.canonicalSlug).toBe("countercharm");
    });
  });

  describe("alias — XPHB 2024 class-suffix slugs (regressão 2026-04-24)", () => {
    // O SRD XPHB 2024 adiciona sufixo `<feature>-<classe>-<level>` ao slug
    // pro seed (ex: `wild-shape-druid-2`). Sem aliases, `featureActionMap.get()`
    // falha e a feature some da ActionBar. Teste regression pros 10 canonicals.
    test.each([
      ["wild-shape-druid-2", "wild-shape"],
      ["rage-barbarian-1", "rage"],
      ["reckless-attack-barbarian-2", "reckless-attack"],
      ["action-surge-fighter-2", "action-surge"],
      ["second-wind-fighter-1", "second-wind"],
      ["sneak-attack-rogue-1", "sneak-attack"],
      ["cunning-action-rogue-2", "cunning-action"],
      ["martial-arts-monk-1", "martial-arts"],
      ["flurry-of-blows-monk-2", "flurry-of-blows"],
      ["patient-defense-monk-2", "patient-defense"],
      ["step-of-the-wind-monk-2", "step-of-the-wind"],
      ["channel-divinity-cleric-2", "channel-divinity"],
      ["channel-divinity-paladin-3", "channel-divinity"],
      ["divine-smite-paladin-2", "divine-smite"],
      ["lay-on-hands-paladin-1", "lay-on-hands"],
      ["font-of-magic-sorcerer-2", "font-of-magic"],
      ["arcane-recovery-wizard-1", "arcane-recovery"],
      ["eldritch-invocations-warlock-2", "eldritch-invocations"],
      ["cutting-words-bard-3", "cutting-words"],
      ["dreadful-strikes-ranger-2", "dreadful-strikes"],
    ])("%s → alias de %s", (slug, canonical) => {
      const c = classifyFeatureForActions(slug);
      expect(c?.kind).toBe("alias");
      expect(c?.canonicalSlug).toBe(canonical);
    });
  });

  describe("hide — XPHB 2024 passives estruturais", () => {
    it("pact-magic-warlock-1 → passive (é spellcasting grant)", () => {
      const c = classifyFeatureForActions("pact-magic-warlock-1");
      expect(c?.kind).toBe("hide");
    });
    it("primal-order-druid-1 → passive", () => {
      const c = classifyFeatureForActions("primal-order-druid-1");
      expect(c?.kind).toBe("hide");
    });
  });

  describe("passthrough — features sem entrada no catálogo", () => {
    it("retorna null pra feature desconhecida (usa fallback regex)", () => {
      expect(classifyFeatureForActions("totally-unknown-feature")).toBeNull();
    });

    it("retorna null pra feature canonical sem override", () => {
      // countercharm (canonical) não tem entry — segue fluxo normal do featureActionMap
      expect(classifyFeatureForActions("countercharm")).toBeNull();
    });

    it("retorna null pra bardic-inspiration canonical", () => {
      expect(classifyFeatureForActions("bardic-inspiration")).toBeNull();
    });
  });
});
