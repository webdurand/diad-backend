import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import {
  getSummonMetadata,
  getSummonStatBlock,
  type SummonStatBlock,
} from "../services/summon-stat-block";



export interface EnrichedParticipantResponse {
  id: string;
  encounterId: string;
  type: "pc" | "monster" | "npc";
  characterId: string | null;
  ownerUserId: string | null;
  monsterId: string | null;
  monster: EncounterParticipantEntity["monster"] | null;
  creatureType: string | null;
  linkedCasterParticipantId: string | null;
  displayName: string;
  faction: string;

  currentHp: number;
  maxHp: number;
  tempHp: number;
  armorClass: number;
  speed: number;

  initiativeRoll: number | null;
  initiativeModifier: number | null;
  initiativeTotal: number | null;

  actionUsed: boolean;
  bonusActionUsed: boolean;
  movementRemaining: number | null;
  reactionsUsed: number;
  attacksUsedThisTurn: number;
  attacksMaxThisTurn: number;

  dodging: boolean;
  hasDashed: boolean;
  hasDisengaged: boolean;


  hasInspiration?: boolean;
  inspirationArmed: boolean;
  helping: boolean;
  helpingAlly: string | null;
  helpingAgainst: string | null;

  concentration: {
    spellSlug: string;
    saveDc: number;
    roundsRemaining: number | null;
  } | null;
  isConcentrating: boolean;
  concentratingOn: string | null;

  grappledBy: string | null;


  spellSlots: Array<{ level: number; total: number; used: number }>;

  effectInstances: unknown[];
  appliedEffects: unknown[];
  conditionInstances: unknown[];
  conditions: string[];

  isDefeated: boolean;
  dyingState: string;
  isVisible: boolean;
  controlledBy: "pc" | "ai" | "dm";

  positionX: number | null;
  positionY: number | null;

  recklessAttackActive: boolean;
  readiedAction: unknown | null;

  legendaryPointsAvailable: number | null;
  legendaryPointsMax: number | null;


  transformationState: {
    source: string;
    sourceCasterParticipantId?: string | null;
    enteredAtRound: number;
    durationRoundsTotal: number | null;
    durationRoundsRemaining: number | null;
    form: {
      monsterSlug: string | null;
      formName: string;
      displayName: string;
      size: string;
      ac: number;
      maxHp: number;
      currentHp: number;
      speed: Record<string, number | undefined>;
    };
    revertTriggers: {
      hpZero: boolean;
      concentrationBroken: boolean;
      durationEnd: boolean;
      playerDismiss: boolean;
    };
  } | null;
}

export interface EnrichedEncounterResponse {
  id: string;
  sessionId: string;
  name: string;
  status: string;

  roundNumber: number;
  turnNumber: number;
  currentTurnParticipantId: string | null;
  turnOrder: string[];

  inLair: boolean;
  difficulty: unknown | null;
  mapData: unknown;

  participants: EnrichedParticipantResponse[];
  tileEffects: EnrichedTileEffectResponse[];

  createdAt: string;
  updatedAt: string;
}

export interface EnrichedTileEffectResponse {
  id: string;
  encounterId: string;
  sourceSpellSlug: string;
  sourceParticipantId: string | null;
  effectKind: string | null;
  shapeKind: "sphere" | "cube" | "cylinder" | "line" | "cone";
  originCell: {
    x: number;
    y: number;
    direction?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | null;
    end?: { x: number; y: number } | null;
  };
  radiusCells: number;
  damageDice: string;
  damageType: string;
  durationRoundsRemaining: number | null;
  saveDc: number | null;
  saveAbility: string | null;
  isDifficultTerrain: boolean;
  speedMultiplier: number | null;
  sourceConcentration: boolean;
  auraFollowsCaster: boolean;
  narrativeDescriptor: string | null;
}


function mapParticipant(
  p: EncounterParticipantEntity,
): EnrichedParticipantResponse {
  const pAny = p as any;
  const summonStatBlock = getSummonStatBlock(p);
  const summonMetadata = getSummonMetadata(p);
  const isFamiliar = summonMetadata?.source === "find-familiar-spell";
  const isSteed = summonMetadata?.source === "find-steed-spell";
  const monster = summonStatBlock
    ? mapSummonMonster(p.monster, summonStatBlock)
    : isFamiliar
      ? mapFamiliarMonster(
          p.monster,
          String(summonMetadata?.familiarCreatureType ?? "fey"),
        )
      : (p.monster ?? null);


  let controlledBy: "pc" | "ai" | "dm" = p.controlledBy;
  if ((controlledBy as string) === "human") controlledBy = "pc";

  return {
    id: p.id,
    encounterId: p.encounterId,
    type: p.type,
    characterId: p.characterId ?? null,
    ownerUserId:
      typeof pAny.ownerUserId === "string" ? pAny.ownerUserId : null,
    monsterId: p.monsterId ?? null,
    monster,
    creatureType: isFamiliar
      ? String(summonMetadata?.familiarCreatureType ?? "fey")
      : isSteed
        ? String(summonMetadata?.steedCreatureType ?? "celestial")
      : (p.monster?.type ?? null),
    linkedCasterParticipantId: p.linkedCasterParticipantId ?? null,
    displayName: p.displayName,
    faction: p.faction,


    currentHp: pAny.currentHp ?? p.currentHp ?? 0,
    maxHp: summonStatBlock?.maxHp ?? pAny.maxHp ?? p.maxHp ?? 0,
    tempHp: p.tempHp ?? 0,
    armorClass: summonStatBlock?.armorClass ?? pAny.armorClass ?? 10,
    speed: summonStatBlock?.speed ?? pAny.speed ?? 30,

    initiativeRoll: p.initiativeRoll ?? null,
    initiativeModifier: pAny.initiativeModifier ?? p.initiativeModifier ?? null,
    initiativeTotal: p.initiativeTotal ?? null,

    actionUsed: p.actionUsed ?? false,
    bonusActionUsed: p.bonusActionUsed ?? false,
    movementRemaining: p.movementRemaining ?? null,
    reactionsUsed: p.reactionsUsed ?? 0,
    attacksUsedThisTurn: p.attacksUsedThisTurn ?? 0,
    attacksMaxThisTurn: p.attacksMaxThisTurn ?? 1,


    dodging: p.dodgingUntilTurnOfParticipantId != null,
    hasDashed: p.hasDashed ?? false,
    hasDisengaged: p.hasDisengaged ?? false,



    hasInspiration: pAny.hasInspiration,
    inspirationArmed: p.inspirationArmed ?? false,
    helping: p.helpingAllyParticipantId != null,
    helpingAlly: p.helpingAllyParticipantId ?? null,
    helpingAgainst: p.helpingTargetParticipantId ?? null,


    concentration:
      p.isConcentrating && p.concentratingOn
        ? {
            spellSlug: p.concentratingOn,
            saveDc: p.concentrationSaveDc ?? 10,
            roundsRemaining: p.concentrationRoundsRemaining ?? null,
          }
        : null,
    isConcentrating: p.isConcentrating ?? false,
    concentratingOn: p.concentratingOn ?? null,

    grappledBy: p.grappledByParticipantId ?? null,


    spellSlots: pAny.spellSlots ?? [],

    effectInstances: p.effectInstances ?? [],
    appliedEffects: p.appliedEffects ?? [],
    conditionInstances: p.conditionInstances ?? [],
    conditions: p.conditions ?? [],

    isDefeated: p.isDefeated ?? false,
    dyingState: p.dyingState ?? "none",
    isVisible: p.isVisible ?? true,
    controlledBy,

    positionX: p.positionX ?? null,
    positionY: p.positionY ?? null,

    recklessAttackActive: p.recklessAttackActive ?? false,
    readiedAction: p.readiedAction ?? null,

    legendaryPointsAvailable: p.legendaryPointsAvailable ?? null,
    legendaryPointsMax: p.legendaryPointsMax ?? null,

    transformationState: p.transformationState
      ? {
          source: p.transformationState.source,
          sourceCasterParticipantId:
            p.transformationState.sourceCasterParticipantId ?? null,
          enteredAtRound: p.transformationState.enteredAtRound,
          durationRoundsTotal: p.transformationState.durationRoundsTotal,
          durationRoundsRemaining:
            p.transformationState.durationRoundsRemaining,
          form: {
            monsterSlug: p.transformationState.form.monsterSlug,
            formName: p.transformationState.form.formName,
            displayName: p.transformationState.form.displayName,
            size: p.transformationState.form.size,
            ac: p.transformationState.form.ac,
            maxHp: p.transformationState.form.maxHp,
            currentHp: p.transformationState.form.currentHp,
            speed: p.transformationState.form.speed,
          },
          revertTriggers: p.transformationState.revertTriggers,
        }
      : null,
  };
}

function mapFamiliarMonster(
  monster: EncounterParticipantEntity["monster"] | null | undefined,
  creatureType: string,
): EncounterParticipantEntity["monster"] | null {
  if (!monster) return null;
  const familiarTraits = [
    {
      name: "Familiar",
      desc: "O familiar age em sua própria iniciativa e obedece ao conjurador. Ele não pode atacar, mas pode realizar as outras ações normalmente.",
    },
    {
      name: "Vínculo Telepático",
      desc: "O conjurador pode se comunicar telepaticamente com o familiar enquanto ele estiver a até 100 pés.",
    },
    {
      name: "Compartilhar Sentidos",
      desc: "Como ação, o conjurador pode ver e ouvir pelos sentidos do familiar até o início do próximo turno.",
    },
    {
      name: "Entregar Magia de Toque",
      desc: "A até 100 pés, o familiar pode usar sua reação para entregar uma magia de toque do conjurador.",
    },
    {
      name: "Bolsão Dimensional",
      desc: "Como ação, o conjurador pode dispensar temporariamente o familiar e fazê-lo reaparecer depois em um espaço desocupado a até 30 pés.",
    },
  ];
  return {
    ...(monster as any),
    type: creatureType,
    actions: [],
    multiattack: null,
    special_abilities: [
      ...(((monster as any).special_abilities ?? []) as Array<
        Record<string, unknown>
      >),
      ...familiarTraits,
    ],
  } as EncounterParticipantEntity["monster"];
}

function mapSummonMonster(
  monster: EncounterParticipantEntity["monster"] | null | undefined,
  statBlock: SummonStatBlock,
): EncounterParticipantEntity["monster"] | null {
  if (!monster) return null;
  const formLabel =
    statBlock.form === "air"
      ? "Ar"
      : statBlock.form === "land" || statBlock.form === "earth"
        ? "Terra"
        : statBlock.form === "fire"
          ? "Fogo"
          : statBlock.form === "water"
            ? "Água"
            : statBlock.form === "horse"
              ? "Cavalo"
              : statBlock.form === "camel"
                ? "Camelo"
                : statBlock.form === "dire-wolf"
                  ? "Lobo Atroz"
                  : "Alce";
  const spiritLabel =
    statBlock.kind === "bestial-spirit"
      ? "Espírito Bestial"
      : statBlock.kind === "elemental-spirit"
        ? "Espírito Elemental"
        : "Corcel Extraplanar";
  const traits = [
    statBlock.traits.flyby
      ? {
          name: "Flyby",
          desc: "O espírito não provoca ataques de oportunidade ao voar para fora do alcance de um inimigo.",
        }
      : null,
    statBlock.traits.packTactics
      ? {
          name: "Pack Tactics",
          desc: "O espírito tem vantagem se um aliado não incapacitado estiver a 5 pés do alvo.",
        }
      : null,
    statBlock.traits.waterBreathing
      ? {
          name: "Water Breathing",
          desc: "O espírito respira apenas debaixo d'água.",
        }
      : null,
    statBlock.traits.amorphousForm
      ? {
          name: "Amorphous Form",
          desc: "O espírito pode atravessar um espaço de apenas 1 polegada sem que ele conte como terreno difícil.",
        }
      : null,
    statBlock.traits.hover
      ? {
          name: "Hover",
          desc: "O espírito paira enquanto voa.",
        }
      : null,
    statBlock.traits.lifeBond
      ? {
          name: "Vínculo Vital",
          desc: "Quando o conjurador recupera PV com uma magia de nível 1 ou maior a até 5 pés, o corcel recupera a mesma quantidade.",
        }
      : null,
  ].filter(Boolean);
  const steedBonusAction = statBlock.steed
    ? statBlock.steed.bonusAction === "healing-touch"
      ? {
          name: "Toque Curativo",
          desc: `Uma criatura a 5 pés recupera 2d8 + ${statBlock.slotLevel} PV. Recarrega após descanso longo.`,
        }
      : statBlock.steed.bonusAction === "fey-step"
        ? {
            name: "Passo Feérico",
            desc: "O corcel e seu cavaleiro se teleportam até 60 pés para um espaço desocupado. Recarrega após descanso longo.",
          }
        : {
            name: "Olhar Terrível",
            desc: `Uma criatura a 60 pés faz resistência de SAB CD ${statBlock.steed.spellSaveDc}; na falha fica Amedrontada até o fim do próximo turno do conjurador. Recarrega após descanso longo.`,
          }
    : null;
  const actions = [
    statBlock.attack.attacksPerAction > 1
      ? {
          name: "Multiattack",
          desc: `O espírito realiza ${statBlock.attack.attacksPerAction} ataques de ${statBlock.attack.name}.`,
        }
      : null,
    {
      name: statBlock.attack.name,
      desc: `Melee Spell Attack: +${statBlock.attack.attackBonus} to hit, reach ${statBlock.attack.reachFt} ft. Hit: ${statBlock.attack.damageDice} + ${statBlock.attack.damageBonus} ${statBlock.attack.damageType} damage.`,
    },
  ].filter(Boolean);

  return {
    ...(monster as any),
    name: `${spiritLabel} (${formLabel})`,
    armor_class: [{ type: "natural", value: statBlock.armorClass }],
    hit_points: statBlock.maxHp,
    hit_points_roll: String(statBlock.maxHp),
    speed: statBlock.movementModes,
    damage_resistances: statBlock.damageResistances,
    damage_immunities: statBlock.damageImmunities,
    condition_immunities: statBlock.conditionImmunities,
    actions,
    multiattack:
      statBlock.attack.attacksPerAction > 1
        ? {
            description: `O espírito realiza ${statBlock.attack.attacksPerAction} ataques de ${statBlock.attack.name}.`,
            sequence: [
              {
                actionName: statBlock.attack.name,
                count: statBlock.attack.attacksPerAction,
              },
            ],
          }
        : null,
    special_abilities: traits,
    bonus_actions: steedBonusAction ? [steedBonusAction] : [],
  } as EncounterParticipantEntity["monster"];
}


export function toEnrichedEncounterResponse(
  encounter: EncounterEntity,
  opts?: { tileEffects?: EnrichedTileEffectResponse[] },
): EnrichedEncounterResponse {
  const isActive = encounter.status !== "preparing";
  const turnOrder = encounter.turnOrder ?? [];
  const currentTurnIndex = encounter.currentTurnIndex ?? 0;

  return {
    id: encounter.id,
    sessionId: encounter.sessionId,
    name: encounter.name,
    status: encounter.status,

    roundNumber: isActive ? (encounter.currentRound ?? 1) : 0,
    turnNumber: isActive ? currentTurnIndex + 1 : 0,
    currentTurnParticipantId: isActive
      ? (turnOrder[currentTurnIndex] ?? null)
      : null,
    turnOrder,

    inLair: encounter.inLair ?? false,
    difficulty: encounter.difficulty ?? null,
    mapData: encounter.mapData ?? {},

    participants: (encounter.participants ?? []).map(mapParticipant),
    tileEffects: opts?.tileEffects ?? [],

    createdAt:
      encounter.createdAt instanceof Date
        ? encounter.createdAt.toISOString()
        : String(encounter.createdAt ?? ""),
    updatedAt:
      encounter.updatedAt instanceof Date
        ? encounter.updatedAt.toISOString()
        : String(encounter.updatedAt ?? ""),
  };
}
