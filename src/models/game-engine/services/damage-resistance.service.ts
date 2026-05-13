import { Injectable } from "@nestjs/common";
import type {
  DamageInstance,
  DamageProfile,
  ApplyDamageOptions,
  ResistanceApplyResult,
} from "../interfaces/combat.interfaces";


@Injectable()
export class DamageResistanceService {
  applyToDamage(
    profile: DamageProfile,
    parts: DamageInstance[],
    opts: ApplyDamageOptions = {},
  ): ResistanceApplyResult {
    const immunities = this.normalize(profile.immunities);
    const resistances = this.normalize(profile.resistances);
    const vulnerabilities = this.normalize(profile.vulnerabilities);

    const perPartFinal: ResistanceApplyResult["perPartFinal"] = parts.map(
      (part) => {
        const t = (part.type ?? "").toLowerCase();
        const isImmune = !opts.ignoreImmunity && this.matches(immunities, t);
        const isResist = !opts.ignoreResistance && this.matches(resistances, t);
        const isVuln = this.matches(vulnerabilities, t);

        if (isImmune) {
          return {
            ...part,
            afterModifier: 0,
            modifier: "immune",
          };
        }

        if (isResist && isVuln) {
          return {
            ...part,
            afterModifier: part.amount,
            modifier: "none",
          };
        }
        if (isResist) {
          return {
            ...part,
            afterModifier: Math.floor(part.amount / 2),
            modifier: "resist",
          };
        }
        if (isVuln) {
          return {
            ...part,
            afterModifier: part.amount * 2,
            modifier: "vuln",
          };
        }
        return {
          ...part,
          afterModifier: part.amount,
          modifier: "none",
        };
      },
    );

    const finalDamage = perPartFinal.reduce(
      (sum, p) => sum + p.afterModifier,
      0,
    );
    return { finalDamage, perPartFinal };
  }


  profileFromMonster(monster: {
    damage_resistances?: unknown;
    damage_immunities?: unknown;
    damage_vulnerabilities?: unknown;
  }): DamageProfile {
    return {
      resistances: this.extractList(monster.damage_resistances),
      immunities: this.extractList(monster.damage_immunities),
      vulnerabilities: this.extractList(monster.damage_vulnerabilities),
    };
  }

  private extractList(raw: unknown): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map((v) => String(v).toLowerCase());
    }
    if (typeof raw === "object") {
      const obj = raw as Record<string, unknown>;

      const list = Array.isArray(obj.types)
        ? obj.types
        : Object.values(obj).filter((v) => typeof v === "string");
      return (list as unknown[]).map((v) => String(v).toLowerCase());
    }
    return [];
  }

  private normalize(list: string[]): string[] {
    return list.map((s) => s.toLowerCase().trim());
  }

  private matches(list: string[], type: string): boolean {
    if (!type) return false;
    return list.some(
      (entry) => entry === type || entry.includes(type) || type.includes(entry),
    );
  }
}
