import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { CharacterClassEntity } from "src/entities/character-class.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type { ConditionSlug } from "../interfaces/combat.interfaces";

type PassiveAuraKind = "aura-of-courage" | "aura-of-devotion";

export interface PaladinAuraBenefit {
  sourceParticipantId: string;
  sourceName: string;
  featureSlug:
    | PassiveAuraKind
    | "smite-of-protection";
  radiusFeet: number;
  bonus: number;
}

const INCAPACITATING_CONDITIONS = new Set([
  "incapacitated",
  "paralyzed",
  "petrified",
  "stunned",
  "unconscious",
]);

function normalizedSlug(slug?: string | null): string {
  return (slug ?? "").trim().toLowerCase().replace(/-(phb|xphb|srd52)$/, "");
}

@Injectable()
export class PaladinAuraService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly characterClasses: Repository<CharacterClassEntity>,
  ) {}

  async getConditionImmunity(
    target: EncounterParticipantEntity,
    condition: ConditionSlug,
  ): Promise<PaladinAuraBenefit | null> {
    const normalizedCondition =
      condition === "hypnotized" ? "charmed" : condition;
    const auraKind: PassiveAuraKind | null =
      normalizedCondition === "frightened"
        ? "aura-of-courage"
        : normalizedCondition === "charmed"
          ? "aura-of-devotion"
          : null;
    if (!auraKind) return null;

    const sources = await this.getEligiblePaladins(target);
    for (const { participant, paladinLevel, subclassSlug } of sources) {
      const hasFeature =
        auraKind === "aura-of-courage"
          ? paladinLevel >= 10
          : paladinLevel >= 7 && subclassSlug.includes("devotion");
      if (!hasFeature) continue;
      const radiusFeet = paladinLevel >= 18 ? 30 : 10;
      if (!this.isWithinAura(participant, target, radiusFeet)) continue;
      return {
        sourceParticipantId: participant.id,
        sourceName: participant.displayName,
        featureSlug: auraKind,
        radiusFeet,
        bonus: 0,
      };
    }
    return null;
  }

  async getSmiteOfProtectionHalfCover(
    target: EncounterParticipantEntity,
  ): Promise<PaladinAuraBenefit | null> {
    const sources = await this.getEligiblePaladins(target);
    for (const { participant, paladinLevel } of sources) {
      const active = (participant.effectInstances ?? []).some(
        (effect) =>
          effect.kind === "aura_half_cover" &&
          effect.sourceFeatureSlug === "smite-of-protection",
      );
      if (!active) continue;
      const radiusFeet = paladinLevel >= 18 ? 30 : 10;
      if (!this.isWithinAura(participant, target, radiusFeet)) continue;
      return {
        sourceParticipantId: participant.id,
        sourceName: participant.displayName,
        featureSlug: "smite-of-protection",
        radiusFeet,
        bonus: 2,
      };
    }
    return null;
  }

  private async getEligiblePaladins(
    target: EncounterParticipantEntity,
  ): Promise<
    Array<{
      participant: EncounterParticipantEntity;
      paladinLevel: number;
      subclassSlug: string;
    }>
  > {
    if (
      target.positionX == null ||
      target.positionY == null ||
      target.isDefeated
    ) {
      return [];
    }
    const encounterParticipants = await this.participants.find({
      where: { encounterId: target.encounterId },
    });
    const candidates = encounterParticipants.filter(
      (participant) =>
        participant.faction === target.faction &&
        participant.characterId &&
        !participant.isDefeated &&
        participant.positionX != null &&
        participant.positionY != null &&
        !(participant.conditions ?? []).some((condition) =>
          INCAPACITATING_CONDITIONS.has(condition),
        ),
    );
    if (candidates.length === 0) return [];

    const classes = await this.characterClasses.find({
      where: {
        character_id: In(candidates.map((participant) => participant.characterId!)),
      },
      relations: ["class", "subclass"],
    });
    return candidates.flatMap((participant) => {
      const paladin = classes.find(
        (characterClass) =>
          characterClass.character_id === participant.characterId &&
          normalizedSlug(characterClass.class?.slug) === "paladin",
      );
      if (!paladin) return [];
      return [
        {
          participant,
          paladinLevel: paladin.class_level,
          subclassSlug: normalizedSlug(paladin.subclass?.slug),
        },
      ];
    });
  }

  private isWithinAura(
    source: EncounterParticipantEntity,
    target: EncounterParticipantEntity,
    radiusFeet: number,
  ): boolean {
    if (
      source.positionX == null ||
      source.positionY == null ||
      target.positionX == null ||
      target.positionY == null
    ) {
      return false;
    }
    const distanceCells = Math.max(
      Math.abs(source.positionX - target.positionX),
      Math.abs(source.positionY - target.positionY),
    );
    return distanceCells * 5 <= radiusFeet;
  }
}
