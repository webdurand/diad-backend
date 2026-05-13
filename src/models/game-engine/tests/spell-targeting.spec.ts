import {
  isAoeSpell,
  isMultiTargetNonAoeSpell,
  maxTargetsFor,
  MULTI_TARGET_NON_AOE_SPELLS,
} from "../services/spell-targeting";



type MiniSpell = { slug: string; area_of_effect: unknown };


const acidSplash: MiniSpell = { slug: "acid-splash", area_of_effect: null };
const burningHands: MiniSpell = {
  slug: "burning-hands",
  area_of_effect: { type: "cone", size: 15 },
};
const fireball: MiniSpell = {
  slug: "fireball",
  area_of_effect: { type: "sphere", size: 20 },
};
const fireBolt: MiniSpell = { slug: "fire-bolt", area_of_effect: null };
const magicMissile: MiniSpell = { slug: "magic-missile", area_of_effect: null };
const eldritchBlast: MiniSpell = {
  slug: "eldritch-blast",
  area_of_effect: null,
};
const scorchingRay: MiniSpell = { slug: "scorching-ray", area_of_effect: null };
const cureWounds: MiniSpell = { slug: "cure-wounds", area_of_effect: null };

describe("spell-targeting — US14 (Spec 005)", () => {
  describe("isAoeSpell", () => {
    it("reconhece spells com area_of_effect definido", () => {
      expect(isAoeSpell(burningHands as any)).toBe(true);
      expect(isAoeSpell(fireball as any)).toBe(true);
    });
    it("rejeita spells sem area_of_effect", () => {
      expect(isAoeSpell(fireBolt as any)).toBe(false);
      expect(isAoeSpell(magicMissile as any)).toBe(false);
      expect(isAoeSpell(cureWounds as any)).toBe(false);
      expect(isAoeSpell(acidSplash as any)).toBe(false);
    });
    it("rejeita area_of_effect XPHB que só tem tags (sem shape real)", () => {


      const xphbMultiTarget = {
        slug: "acid-splash-phb",
        area_of_effect: { tags: ["multiple targets"] },
      };
      const xphbSingle = {
        slug: "fire-bolt-phb",
        area_of_effect: { tags: ["single target"] },
      };
      expect(isAoeSpell(xphbMultiTarget as any)).toBe(false);
      expect(isAoeSpell(xphbSingle as any)).toBe(false);
    });
  });

  describe("isMultiTargetNonAoeSpell", () => {
    it("reconhece Magic Missile, Eldritch Blast, Scorching Ray e Acid Splash", () => {
      expect(isMultiTargetNonAoeSpell(magicMissile as any)).toBe(true);
      expect(isMultiTargetNonAoeSpell(eldritchBlast as any)).toBe(true);
      expect(isMultiTargetNonAoeSpell(scorchingRay as any)).toBe(true);
      expect(isMultiTargetNonAoeSpell(acidSplash as any)).toBe(true);
    });
    it("rejeita spells single-target e AoE", () => {
      expect(isMultiTargetNonAoeSpell(fireBolt as any)).toBe(false);
      expect(isMultiTargetNonAoeSpell(cureWounds as any)).toBe(false);
      expect(isMultiTargetNonAoeSpell(burningHands as any)).toBe(false);
    });
  });

  describe("maxTargetsFor", () => {
    it("retorna Infinity para spells AoE (forma define; range validado à parte)", () => {
      expect(maxTargetsFor(burningHands as any, 1, 3)).toBe(
        Number.POSITIVE_INFINITY,
      );
      expect(maxTargetsFor(fireball as any, 3, 5)).toBe(
        Number.POSITIVE_INFINITY,
      );
    });

    it("retorna 1 para spells single-target (default)", () => {
      expect(maxTargetsFor(fireBolt as any, 0, 3)).toBe(1);
      expect(maxTargetsFor(cureWounds as any, 1, 3)).toBe(1);
    });

    it("Magic Missile: 3 dardos no slot 1, +1 por upcast, capado em 10", () => {
      expect(maxTargetsFor(magicMissile as any, 1, 3)).toBe(3);
      expect(maxTargetsFor(magicMissile as any, 2, 3)).toBe(4);
      expect(maxTargetsFor(magicMissile as any, 5, 9)).toBe(7);
      expect(maxTargetsFor(magicMissile as any, 9, 17)).toBe(10);
    });

    it("Eldritch Blast: escala por casterLevel (1 < 5, 2 em 5-10, 3 em 11-16, 4 em 17+)", () => {
      expect(maxTargetsFor(eldritchBlast as any, 0, 1)).toBe(1);
      expect(maxTargetsFor(eldritchBlast as any, 0, 5)).toBe(2);
      expect(maxTargetsFor(eldritchBlast as any, 0, 11)).toBe(3);
      expect(maxTargetsFor(eldritchBlast as any, 0, 17)).toBe(4);
    });

    it("Scorching Ray: 3 raios no slot 2, +1 por upcast", () => {
      expect(maxTargetsFor(scorchingRay as any, 2, 5)).toBe(3);
      expect(maxTargetsFor(scorchingRay as any, 3, 5)).toBe(4);
      expect(maxTargetsFor(scorchingRay as any, 5, 9)).toBe(6);
    });
  });

  describe("MULTI_TARGET_NON_AOE_SPELLS catálogo", () => {
    it("reconhece magias canônicas curadas", () => {
      expect("magic-missile" in MULTI_TARGET_NON_AOE_SPELLS).toBe(true);
      expect("eldritch-blast" in MULTI_TARGET_NON_AOE_SPELLS).toBe(true);
      expect("scorching-ray" in MULTI_TARGET_NON_AOE_SPELLS).toBe(true);
      expect("acid-splash" in MULTI_TARGET_NON_AOE_SPELLS).toBe(true);
    });

    it("tolera sufixos de fonte (-phb, -xphb, etc.)", () => {
      expect("acid-splash-phb" in MULTI_TARGET_NON_AOE_SPELLS).toBe(true);
      expect("magic-missile-xphb" in MULTI_TARGET_NON_AOE_SPELLS).toBe(true);
      const splashVariant: MiniSpell = {
        slug: "acid-splash-phb",
        area_of_effect: null,
      };
      expect(isMultiTargetNonAoeSpell(splashVariant as any)).toBe(true);
      expect(maxTargetsFor(splashVariant as any, 0, 3)).toBe(2);
    });

    it("Acid Splash: até 2 alvos (cantrip multi-target RAW)", () => {
      const splash: MiniSpell = { slug: "acid-splash", area_of_effect: null };
      expect(maxTargetsFor(splash as any, 0, 3)).toBe(2);
      expect(maxTargetsFor(splash as any, 0, 17)).toBe(2);
    });
  });
});
