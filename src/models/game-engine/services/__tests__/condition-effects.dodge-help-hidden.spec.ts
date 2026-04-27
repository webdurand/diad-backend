import { ConditionEffectsService } from "../condition-effects.service";
import type { HelpingState } from "../../interfaces/combat.interfaces";

/**
 * Spec 003 T010 — testa extensão do ConditionEffectsService para cobrir os
 * estados reativos introduzidos nesta spec: Dodge, Help, Hidden.
 *
 * Os métodos antigos `getAttackModifiers(conditions: string[])` continuam
 * funcionando; esta spec adiciona `getReactiveAttackModifiers` que recebe
 * os dois participantes completos e um contexto opcional de Help.
 */

type P = {
  id: string;
  conditions: string[];
  dodgingUntilTurnOfParticipantId: string | null;
};

const mk = (over: Partial<P> = {}): P => ({
  id: over.id ?? "p1",
  conditions: over.conditions ?? [],
  dodgingUntilTurnOfParticipantId: over.dodgingUntilTurnOfParticipantId ?? null,
});

describe("ConditionEffectsService — reactive states (dodge / help / hidden)", () => {
  const svc = new ConditionEffectsService();

  describe("Dodge", () => {
    it("alvo esquivando + atacante vidente e não-incapacitated → disadvantage", () => {
      const attacker = mk({ id: "a", conditions: [] });
      const target = mk({ id: "t", dodgingUntilTurnOfParticipantId: "t" });
      const mods = svc.getReactiveAttackModifiers(attacker, target);
      expect(mods.disadvantage).toBe(true);
      expect(mods.advantage).toBe(false);
    });

    it("alvo esquivando mas atacante incapacitated → sem disadvantage (Dodge só vale contra atacantes que agem)", () => {
      const attacker = mk({ id: "a", conditions: ["incapacitated"] });
      const target = mk({ id: "t", dodgingUntilTurnOfParticipantId: "t" });
      const mods = svc.getReactiveAttackModifiers(attacker, target);
      expect(mods.disadvantage).toBe(false);
    });

    it("alvo esquivando com flag expirada (not self.id) → sem disadvantage", () => {
      const attacker = mk({ id: "a" });
      const target = mk({
        id: "t",
        dodgingUntilTurnOfParticipantId: "other", // flag inconsistente, já expirada
      });
      const mods = svc.getReactiveAttackModifiers(attacker, target);
      expect(mods.disadvantage).toBe(false);
    });
  });

  describe("Hidden", () => {
    it("atacante escondido → advantage (alvo não o vê)", () => {
      const attacker = mk({ id: "a", conditions: ["hidden"] });
      const target = mk({ id: "t" });
      const mods = svc.getReactiveAttackModifiers(attacker, target);
      expect(mods.advantage).toBe(true);
    });

    it("alvo escondido → disadvantage (atacante não o vê)", () => {
      const attacker = mk({ id: "a" });
      const target = mk({ id: "t", conditions: ["hidden"] });
      const mods = svc.getReactiveAttackModifiers(attacker, target);
      expect(mods.disadvantage).toBe(true);
    });
  });

  describe("Help", () => {
    it("Help ativo — atacante é ally, target é target → advantage + consumedHelp", () => {
      const attacker = mk({ id: "ally-1" });
      const target = mk({ id: "target-1" });
      const help: HelpingState = {
        allyParticipantId: "ally-1",
        targetParticipantId: "target-1",
        expiresAtNextTurnOfParticipantId: "helper-1",
      };
      const mods = svc.getReactiveAttackModifiers(attacker, target, {
        helpingAgainst: help,
      });
      expect(mods.advantage).toBe(true);
      expect(mods.consumedHelp).toBe(true);
      expect(mods.helpingAllyParticipantId).toBe("ally-1");
    });

    it("Help não consumido se atacante não é o ally certo", () => {
      const attacker = mk({ id: "outro" });
      const target = mk({ id: "target-1" });
      const help: HelpingState = {
        allyParticipantId: "ally-1",
        targetParticipantId: "target-1",
        expiresAtNextTurnOfParticipantId: "helper-1",
      };
      const mods = svc.getReactiveAttackModifiers(attacker, target, {
        helpingAgainst: help,
      });
      expect(mods.advantage).toBe(false);
      expect(mods.consumedHelp).toBeFalsy();
    });

    it("Help não consumido se alvo não bate", () => {
      const attacker = mk({ id: "ally-1" });
      const target = mk({ id: "outro-target" });
      const help: HelpingState = {
        allyParticipantId: "ally-1",
        targetParticipantId: "target-1",
        expiresAtNextTurnOfParticipantId: "helper-1",
      };
      const mods = svc.getReactiveAttackModifiers(attacker, target, {
        helpingAgainst: help,
      });
      expect(mods.consumedHelp).toBeFalsy();
    });
  });
});
