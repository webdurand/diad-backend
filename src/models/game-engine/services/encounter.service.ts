import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { MonsterEntity } from "src/entities/monster.entity";
import { CharacterEntity } from "src/entities/character.entity";
import { EquipmentEntity } from "src/entities/equipment.entity";
import { CampaignPlayerEntity } from "src/entities/campaign-player.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import { InventoryService } from "src/models/characters/services/inventory.service";
import { DiceService } from "./dice.service";
import { EventService } from "./event.service";
import { SessionService } from "./session.service";
import { CampaignService } from "src/models/world/services/campaign.service";
import { CapstonesService } from "./capstones.service";
import { XpAwardService } from "./xp-award.service";
import { getAbilityModifier } from "src/shared/srd-utils";
import { XP_THRESHOLDS } from "src/shared/srd-constants";
import { EquipmentSourceEnum } from "src/entities/enums";

export interface CreateEncounterDto {
  name: string;
}

/** Spec 007: shape interno normalizado (após normalizeResolvePayload) */
export interface NormalizedResolveDto {
  outcome: "victory" | "retreat" | "negotiation" | "defeat";
  xpRewards: Array<{ characterId: string; xp: number }>;
  goldRewards: Array<{
    characterId: string;
    gp: number;
    cp?: number;
    sp?: number;
    pp?: number;
  }>;
  itemRewards: Array<{
    characterId: string;
    equipmentId?: string;
    magicItemId?: string;
    quantity?: number;
  }>;
  ownerUserId: string;
}

export interface AddMonsterDto {
  monsterId: string;
  count: number;
  displayNamePrefix?: string;
  hpOverride?: number;
}

export interface BatchPositionDto {
  participantId: string;
  x: number;
  y: number;
}

export interface InitiativeRollResult {
  participantId: string;
  displayName: string;
  roll: number;
  modifier: number;
  total: number;
}

export interface EncounterDifficulty {
  totalMonsterXp: number;
  adjustedXp: number;
  threshold: "trivial" | "easy" | "medium" | "hard" | "deadly";
  partySize: number;
  partyAverageLevel: number;
}

@Injectable()
export class EncounterService {
  private readonly logger = new Logger(EncounterService.name);

  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(MonsterEntity)
    private readonly monsterRepo: Repository<MonsterEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    private readonly diceService: DiceService,
    private readonly eventService: EventService,
    private readonly sessionService: SessionService,
    private readonly sheetService: CharacterSheetService,
    private readonly stateService: CharacterStateService,
    private readonly inventoryService: InventoryService,
    private readonly campaignService: CampaignService,
    @Inject(forwardRef(() => CapstonesService))
    private readonly capstones: CapstonesService,
    private readonly xpAwardService: XpAwardService,
  ) {}

  async create(
    sessionId: string,
    dto: CreateEncounterDto,
    ownerUserId?: string,
  ): Promise<EncounterEntity> {
    const encounter = this.encounterRepo.create({
      sessionId,
      name: dto.name,
      status: "preparing",
    });
    const saved = await this.encounterRepo.save(encounter);

    if (ownerUserId) {
      const session = await this.sessionService.getById(sessionId);
      const charIds = new Set<string>();

      // 1. Add PCs explicitly added to the session
      for (const charId of session.characterIds ?? []) {
        charIds.add(charId);
      }

      // 2. Add PCs from campaign players (their chosen characters)
      if (session.campaignId) {
        try {
          const players = await this.campaignService.getPlayers(
            session.campaignId,
          );
          for (const player of players) {
            if (player.characterId) {
              charIds.add(player.characterId);
            }
          }
        } catch {}
      }

      // Add all unique characters with their respective owner IDs.
      // Iterate in deterministic order for snapshot stability.
      // Uses the internal helper to bypass auth/status guards — we already
      // know the encounter is in 'preparing' and the PCs come from trusted
      // sources (session.characterIds or active CampaignPlayers).
      const orderedIds = Array.from(charIds).sort();
      for (const charId of orderedIds) {
        const userId = await this.resolveCharacterOwner(
          charId,
          ownerUserId,
          session.campaignId ?? undefined,
        );
        try {
          await this.attachCharacterToEncounter(saved.id, charId, userId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `auto-include skipped character=${charId} on encounter=${saved.id}: ${msg}`,
          );
        }
      }
    }

    return this.getById(saved.id);
  }

  /**
   * Resolves the owning userId of a character. Lookup order:
   *  1. CampaignPlayer with this characterId (when campaignId is given)
   *  2. CharacterEntity.userId direct DB lookup
   *  3. fallbackUserId (caller — typically the DM)
   */
  async resolveCharacterOwner(
    characterId: string,
    fallbackUserId: string,
    campaignId?: string,
  ): Promise<string> {
    if (campaignId) {
      try {
        const players = await this.campaignService.getPlayers(campaignId);
        const owner = players.find((p) => p.characterId === characterId);
        if (owner?.userId) return owner.userId;
      } catch {
        // fall through to direct lookup
      }
    }
    const character = await this.characterRepo.findOne({
      where: { id: characterId },
      select: ["id", "userId"],
    });
    if (character?.userId) return character.userId;
    return fallbackUserId;
  }

  async getById(encounterId: string): Promise<EncounterEntity> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
      relations: ["participants"],
    });
    if (!encounter) throw new NotFoundException("Encontro nao encontrado.");
    await this.enrichPcParticipants(encounter);
    return encounter;
  }

  /**
   * Spec 006: enriquece PC participants com dados do sheet (HP, AC, speed, init).
   * Resolve ownerId em batch para evitar N queries.
   */
  private async enrichPcParticipants(
    encounter: EncounterEntity,
  ): Promise<void> {
    const pcParticipants = (encounter.participants ?? []).filter(
      (p) => p.type === "pc" && p.characterId,
    );
    if (pcParticipants.length === 0) return;

    // Batch: buscar owners dos characterIds
    const charIds = pcParticipants.map((p) => p.characterId!);
    const characters = await this.characterRepo
      .createQueryBuilder("c")
      .select(["c.id", "c.userId"])
      .where("c.id IN (:...ids)", { ids: charIds })
      .getMany();
    const ownerMap = new Map<string, string>();
    for (const c of characters) {
      if (c.userId) ownerMap.set(c.id, c.userId);
    }

    // Se tem campanha, complementar com CampaignPlayer
    const session = await this.sessionService
      .getById(encounter.sessionId)
      .catch(() => null);
    if (session?.campaignId) {
      try {
        const players = await this.campaignService.getPlayers(
          session.campaignId,
        );
        for (const pl of players) {
          if (pl.characterId && pl.userId && !ownerMap.has(pl.characterId)) {
            ownerMap.set(pl.characterId, pl.userId);
          }
        }
      } catch {
        // fall through — direct lookup já cobriu
      }
    }

    // Enriquecer em paralelo
    await Promise.all(
      pcParticipants.map(async (p) => {
        const ownerId = ownerMap.get(p.characterId!);
        if (!ownerId) return;
        try {
          const sheet = await this.sheetService.computeSheet(
            ownerId,
            p.characterId!,
          );
          // Spec 012 \u2014 PC transformado: overlay de HP/AC/speed do form
          // (Wild Shape, Polymorph, etc). Display reflete a criatura ativa.
          if (p.transformationState) {
            const form = p.transformationState.form;
            (p as any).currentHp = form.currentHp;
            (p as any).maxHp = form.maxHp;
            (p as any).armorClass = form.ac;
            (p as any).speed = form.speed.walk ?? 30;
          } else {
            (p as any).currentHp = sheet.currentHp;
            (p as any).maxHp = sheet.maxHp;
            (p as any).armorClass = sheet.armorClass;
            (p as any).speed = sheet.speed ?? 30;
          }
          // Spec 012 Gap #23 — tempHp vive em char_state pra PCs (Dark One's Blessing,
          // False Life, Heroism, etc). Participant.tempHp podia ficar stale. Overlay do
          // sheet garante que combat e /sheet usem a mesma fonte.
          (p as any).tempHp = sheet.tempHp ?? 0;
          if (
            p.initiativeModifier == null ||
            p.initiativeModifier !== sheet.initiative
          ) {
            (p as any).initiativeModifier = sheet.initiative;
          }
          (p as any).deathSaveSuccesses = sheet.deathSaves?.successes ?? 0;
          (p as any).deathSaveFailures = sheet.deathSaves?.failures ?? 0;
          // Spec 012: expor spellSlots do sheet pro harness e pra UI validar
          // slot-consumed invariants sem precisar GET /sheet em paralelo.
          (p as any).spellSlots = sheet.spellSlots ?? [];
          // Spec 012 — Heroic Inspiration (persistente na ficha).
          (p as any).hasInspiration = await this.stateService
            .getInspiration(p.characterId!)
            .catch(() => false);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.debug(
            `enrichPcParticipants skipped characterId=${p.characterId}: ${msg}`,
          );
        }
      }),
    );
  }

  async listBySession(sessionId: string): Promise<EncounterEntity[]> {
    return this.encounterRepo.find({
      where: { sessionId },
      relations: ["participants"],
      order: { createdAt: "DESC" },
    });
  }

  async listByCampaign(campaignId: string): Promise<EncounterEntity[]> {
    // Find all sessions for this campaign, then all encounters
    const sessions = await this.encounterRepo.manager.find(
      "GameSessionEntity" as any,
      {
        where: { campaignId },
      } as any,
    );
    const sessionIds = sessions.map((s: any) => s.id);
    if (sessionIds.length === 0) return [];

    return this.encounterRepo
      .createQueryBuilder("e")
      .leftJoinAndSelect("e.participants", "p")
      .where("e.session_id IN (:...sessionIds)", { sessionIds })
      .orderBy("e.createdAt", "DESC")
      .getMany();
  }

  async addMonster(
    encounterId: string,
    dto: AddMonsterDto,
  ): Promise<EncounterParticipantEntity[]> {
    const monster = await this.monsterRepo.findOne({
      where: { id: dto.monsterId },
    });
    if (!monster) throw new NotFoundException("Monstro nao encontrado.");

    const existingCount = await this.participantRepo.count({
      where: { encounterId, monsterId: dto.monsterId },
    });

    const prefix = dto.displayNamePrefix ?? monster.name;
    const dexMod = getAbilityModifier(monster.dexterity);

    const participants: EncounterParticipantEntity[] = [];
    for (let i = 0; i < dto.count; i++) {
      const index = existingCount + i + 1;
      const displayName =
        dto.count === 1 && existingCount === 0 ? prefix : `${prefix} ${index}`;

      let hp = dto.hpOverride ?? monster.hit_points;
      if (!dto.hpOverride && monster.hit_points_roll) {
        const rolled = this.diceService.rollExpression(monster.hit_points_roll);
        hp = Math.max(1, rolled.total);
      }

      const participant = this.participantRepo.create({
        encounterId,
        type: "monster",
        monsterId: dto.monsterId,
        displayName,
        initiativeModifier: dexMod,
        currentHp: hp,
        maxHp: hp,
        tempHp: 0,
        conditions: [],
        isDefeated: false,
        faction: "enemy",
        // Spec 003 FR-018 — monstros default 'dm' (backfill da migration só
        // pega rows existentes; novos precisam explícito).
        controlledBy: "dm",
      });
      participants.push(participant);
    }

    return this.participantRepo.save(participants);
  }

  /**
   * Adds a PC to an encounter in 'preparing' status.
   *
   * Authorization (F2 fix): allows either the PC owner or the DM of the
   * encounter's campaign (when the character belongs to an active
   * CampaignPlayer). Encounter status transitions return 409, never 404.
   */
  async addCharacter(
    encounterId: string,
    characterId: string,
    callerUserId: string,
  ): Promise<EncounterParticipantEntity> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
      relations: ["participants"],
    });
    if (!encounter) {
      throw new NotFoundException({
        ok: false,
        code: "ENCOUNTER_NOT_FOUND",
        error: "Encontro nao encontrado.",
      });
    }
    this.assertStatusAllowsDirectAdd(encounter.status);

    const character = await this.characterRepo.findOne({
      where: { id: characterId },
      select: ["id", "userId"],
    });
    if (!character) {
      throw new NotFoundException({
        ok: false,
        code: "CHARACTER_NOT_FOUND",
        error: "Personagem nao encontrado.",
      });
    }

    // Auth comes before duplicate check so a non-member always gets 403,
    // never a conflicting 409 that leaks whether the PC is in the encounter.
    const session = await this.sessionService.getById(encounter.sessionId);
    await this.assertCanAddPc(
      callerUserId,
      character,
      session.campaignId ?? undefined,
    );

    const dup = (encounter.participants ?? []).find(
      (p) => p.type === "pc" && p.characterId === characterId,
    );
    if (dup) {
      throw new ConflictException({
        ok: false,
        code: "CHARACTER_ALREADY_IN_ENCOUNTER",
        error: "Este personagem ja participa deste encontro.",
      });
    }

    return this.attachCharacterToEncounter(
      encounterId,
      characterId,
      character.userId,
    );
  }

  /**
   * Authorization rule shared by /characters and /late-join/character.
   * Throws 403 FORBIDDEN_CAMPAIGN_MEMBER when the caller is neither the PC
   * owner nor the DM of the encounter's campaign (with an active
   * CampaignPlayer for the PC's owner).
   */
  private async assertCanAddPc(
    callerUserId: string,
    character: { id: string; userId: string },
    campaignId: string | undefined,
  ): Promise<void> {
    if (character.userId === callerUserId) return;
    if (campaignId) {
      const campaign = await this.campaignService
        .getById(campaignId)
        .catch(() => null);
      if (campaign && campaign.dmUserId === callerUserId) {
        const players = await this.campaignService
          .getPlayers(campaignId)
          .catch(() => [] as CampaignPlayerEntity[]);
        const match = players.find(
          (p) => p.userId === character.userId && p.isActive,
        );
        if (match) return;
      }
    }
    throw new ForbiddenException({
      ok: false,
      code: "FORBIDDEN_CAMPAIGN_MEMBER",
      error: "Voce nao e um membro autorizado desta campanha.",
    });
  }

  /**
   * Status guard for direct /characters add. Active and completed encounters
   * return 409 pointing callers to the correct flow (late-join for DM,
   * join-requests for players).
   */
  private assertStatusAllowsDirectAdd(status: string): void {
    if (status === "active" || status === "rolling_initiative") {
      throw new ConflictException({
        ok: false,
        code: "ENCOUNTER_ALREADY_ACTIVE",
        error: "O combate ja esta em andamento.",
        hint: "Players devem usar POST /encounters/:id/join-requests. DM pode forcar entrada via POST /encounters/:id/late-join/character.",
      });
    }
    if (status === "completed") {
      throw new ConflictException({
        ok: false,
        code: "ENCOUNTER_COMPLETED",
        error: "Este combate ja foi encerrado.",
      });
    }
  }

  /**
   * Low-level helper: creates the EncounterParticipant without any
   * authorization or status guard. Used by create() (trusted inputs) and by
   * addCharacter/lateJoinCharacter (after guards).
   */
  private async attachCharacterToEncounter(
    encounterId: string,
    characterId: string,
    ownerUserId: string,
  ): Promise<EncounterParticipantEntity> {
    const sheet = await this.sheetService.computeSheet(
      ownerUserId,
      characterId,
    );
    const participant = this.participantRepo.create({
      encounterId,
      type: "pc",
      characterId,
      displayName: sheet.name,
      initiativeModifier: sheet.initiative,
      // HP/AC exposed via enrichPcHp() in GET responses — backed by sheet.
      tempHp: 0,
      conditions: [],
      isDefeated: false,
      faction: "ally",
    });
    return this.participantRepo.save(participant);
  }

  async removeParticipant(participantId: string): Promise<void> {
    await this.participantRepo.delete(participantId);
  }

  /**
   * Add a participant to an active encounter (late join).
   * Rolls initiative and inserts at the correct position in turnOrder.
   */
  async lateJoinCharacter(
    encounterId: string,
    characterId: string,
    callerUserId: string,
  ): Promise<EncounterParticipantEntity> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
      relations: ["participants"],
    });
    if (!encounter) {
      throw new NotFoundException({
        ok: false,
        code: "ENCOUNTER_NOT_FOUND",
        error: "Encontro nao encontrado.",
      });
    }
    if (encounter.status !== "active") {
      throw new ConflictException({
        ok: false,
        code: "ENCOUNTER_NOT_ACTIVE",
        error: "Late-join so e permitido em encontros ativos.",
      });
    }

    const character = await this.characterRepo.findOne({
      where: { id: characterId },
      select: ["id", "userId"],
    });
    if (!character) {
      throw new NotFoundException({
        ok: false,
        code: "CHARACTER_NOT_FOUND",
        error: "Personagem nao encontrado.",
      });
    }

    // Auth before duplicate (same rationale as addCharacter).
    const session = await this.sessionService.getById(encounter.sessionId);
    await this.assertCanAddPc(
      callerUserId,
      character,
      session.campaignId ?? undefined,
    );

    const dup = (encounter.participants ?? []).find(
      (p) => p.type === "pc" && p.characterId === characterId,
    );
    if (dup) {
      throw new ConflictException({
        ok: false,
        code: "CHARACTER_ALREADY_IN_ENCOUNTER",
        error: "Este personagem ja participa deste encontro.",
      });
    }

    const participant = await this.attachCharacterToEncounter(
      encounterId,
      characterId,
      character.userId,
    );

    // Roll initiative (Barbarian L7 Feral Instinct → advantage)
    const mod = participant.initiativeModifier ?? 0;
    let initAdvantage = false;
    try {
      const sheet = (await this.sheetService.computeSheet(
        character.userId,
        characterId,
      )) as unknown as { hasFeralInstinct?: boolean };
      initAdvantage = sheet.hasFeralInstinct === true;
    } catch {
      /* fallback sem sheet */
    }
    const init = this.diceService.rollInitiative(mod, {
      advantage: initAdvantage,
    });
    participant.initiativeRoll = init.roll;
    participant.initiativeTotal = init.total;
    await this.participantRepo.save(participant);

    // Insert into turnOrder at the correct position (sorted by initiative desc)
    const allParticipants = await this.participantRepo.find({
      where: { encounterId },
    });

    // Find where to insert based on initiative
    let insertIndex = encounter.turnOrder.length;
    for (let i = 0; i < encounter.turnOrder.length; i++) {
      const existing = allParticipants.find(
        (p) => p.id === encounter.turnOrder[i],
      );
      if (existing && (existing.initiativeTotal ?? 0) < init.total) {
        insertIndex = i;
        break;
      }
    }

    // Adjust currentTurnIndex if inserting before current turn
    if (insertIndex <= encounter.currentTurnIndex) {
      encounter.currentTurnIndex += 1;
    }

    encounter.turnOrder.splice(insertIndex, 0, participant.id);
    // Spec 011 — ver comentário em lateJoinMonster; save com relations stale
    // disparava cascade que orfanava o participant recém criado.
    await this.encounterRepo.update(
      { id: encounterId },
      {
        turnOrder: encounter.turnOrder,
        currentTurnIndex: encounter.currentTurnIndex,
      },
    );

    return participant;
  }

  async lateJoinMonster(
    encounterId: string,
    dto: AddMonsterDto,
  ): Promise<EncounterParticipantEntity[]> {
    const encounter = await this.getById(encounterId);
    if (encounter.status !== "active") {
      throw new Error("Late join so e permitido em encontros ativos.");
    }

    const newParticipants = await this.addMonster(encounterId, dto);

    const allParticipants = await this.participantRepo.find({
      where: { encounterId },
    });

    for (const participant of newParticipants) {
      // Roll initiative
      const mod = participant.initiativeModifier ?? 0;
      const init = this.diceService.rollInitiative(mod);
      participant.initiativeRoll = init.roll;
      participant.initiativeTotal = init.total;
      await this.participantRepo.save(participant);

      // Insert into turnOrder
      let insertIndex = encounter.turnOrder.length;
      for (let i = 0; i < encounter.turnOrder.length; i++) {
        const existing = allParticipants.find(
          (p) => p.id === encounter.turnOrder[i],
        );
        if (existing && (existing.initiativeTotal ?? 0) < init.total) {
          insertIndex = i;
          break;
        }
      }

      if (insertIndex <= encounter.currentTurnIndex) {
        encounter.currentTurnIndex += 1;
      }

      encounter.turnOrder.splice(insertIndex, 0, participant.id);
    }

    // Spec 011 — `encounter` foi carregado com `relations: ['participants']`
    // (stale em relação aos novos criados via addMonster acima). Usar `save`
    // aqui disparava cascade: TypeORM tentava orfanar os novos participants
    // com UPDATE encounter_id = NULL (FK violation). `update` atualiza
    // apenas as colunas que mudaram sem tocar no grafo de relations.
    await this.encounterRepo.update(
      { id: encounterId },
      {
        turnOrder: encounter.turnOrder,
        currentTurnIndex: encounter.currentTurnIndex,
      },
    );
    return newParticipants;
  }

  async deleteEncounter(encounterId: string): Promise<void> {
    const encounter = await this.getById(encounterId);
    // Clear activeEncounterId if this encounter is active
    await this.sessionService.setActiveEncounter(encounter.sessionId, null);
    // Cascade deletes participants via FK
    await this.encounterRepo.delete(encounterId);
  }

  async rollAllInitiative(
    encounterId: string,
  ): Promise<InitiativeRollResult[]> {
    const encounter = await this.getById(encounterId);
    const participants = encounter.participants ?? [];

    const hasPc = participants.some((p) => p.type === "pc" && !p.isDefeated);
    const hasEnemy = participants.some(
      (p) => p.type === "monster" && !p.isDefeated,
    );
    if (!hasPc || !hasEnemy) {
      throw new Error(
        "O encontro precisa de pelo menos 1 jogador e 1 monstro para rolar iniciativa.",
      );
    }

    const results: InitiativeRollResult[] = [];

    for (const p of participants) {
      if (p.isDefeated) continue;
      const mod = p.initiativeModifier ?? 0;
      const init = this.diceService.rollInitiative(mod);
      p.initiativeRoll = init.roll;
      p.initiativeTotal = init.total;
      results.push({
        participantId: p.id,
        displayName: p.displayName,
        roll: init.roll,
        modifier: mod,
        total: init.total,
      });
    }

    await this.participantRepo.save(participants);

    await this.encounterRepo.update(encounterId, {
      status: "rolling_initiative",
    });

    return results;
  }

  async setManualInitiative(
    participantId: string,
    total: number,
  ): Promise<void> {
    await this.participantRepo.update(participantId, {
      initiativeTotal: total,
    });
  }

  async startCombat(encounterId: string): Promise<EncounterEntity> {
    const encounter = await this.getById(encounterId);
    const participants = (encounter.participants ?? []).filter(
      (p) => !p.isDefeated,
    );

    // Sort by initiative descending, DEX mod as tiebreaker
    participants.sort((a, b) => {
      const diff = (b.initiativeTotal ?? 0) - (a.initiativeTotal ?? 0);
      if (diff !== 0) return diff;
      return (b.initiativeModifier ?? 0) - (a.initiativeModifier ?? 0);
    });

    encounter.turnOrder = participants.map((p) => p.id);
    encounter.currentTurnIndex = 0;
    encounter.currentRound = 1;
    encounter.status = "active";

    await this.encounterRepo.save(encounter);
    await this.sessionService.setActiveEncounter(
      encounter.sessionId,
      encounter.id,
    );

    // Spec 012 Lote C — Capstones start-of-combat pro primeiro participante.
    const startEvents: Array<
      import("../interfaces/result.type").GameEventData
    > = [
      {
        event_type: "encounter_start",
        data: {
          name: encounter.name,
          round: 1,
          turnOrder: encounter.turnOrder,
        },
      },
      {
        event_type: "turn_start",
        actor_participant_id: encounter.turnOrder[0],
        data: { round: 1 },
      },
    ];
    try {
      const firstPid = encounter.turnOrder[0];
      const firstParticipant = participants.find((p) => p.id === firstPid);
      if (firstParticipant?.type === "pc" && firstParticipant.characterId) {
        // Resolve ownerUserId via characterRepo
        const char = await this.characterRepo.findOne({
          where: { id: firstParticipant.characterId },
        });
        if (char?.userId) {
          const capRes = await this.capstones.runStartOfCombat(
            firstParticipant,
            char.userId,
          );
          startEvents.push(...capRes.events);
        }
      }
    } catch {
      // capstones nunca aborta start
    }

    await this.eventService.emit(
      encounter.sessionId,
      encounter.id,
      startEvents,
    );

    return this.getById(encounterId);
  }

  async endEncounter(
    encounterId: string,
  ): Promise<{ totalXp: number; xpPerCharacter: number }> {
    const encounter = await this.getById(encounterId);
    const participants = encounter.participants ?? [];

    const monsters = participants.filter((p) => p.type === "monster");
    const pcs = participants.filter((p) => p.type === "pc" && !p.isDefeated);

    let totalXp = 0;
    for (const m of monsters) {
      if (m.monster) {
        totalXp += m.monster.xp ?? 0;
      }
    }

    const xpPerCharacter =
      pcs.length > 0 ? Math.floor(totalXp / pcs.length) : 0;

    encounter.status = "completed";
    await this.encounterRepo.save(encounter);
    await this.sessionService.setActiveEncounter(encounter.sessionId, null);

    await this.eventService.emit(encounter.sessionId, encounterId, [
      {
        event_type: "encounter_end",
        data: {
          name: encounter.name,
          totalXp,
          xpPerCharacter,
          monstersDefeated: monsters.filter((m) => m.isDefeated).length,
        },
      },
    ]);

    return { totalXp, xpPerCharacter };
  }

  async calculateDifficulty(
    encounterId: string,
    partyLevels: number[],
  ): Promise<EncounterDifficulty> {
    const encounter = await this.getById(encounterId);
    const monsters = (encounter.participants ?? []).filter(
      (p) => p.type === "monster" && p.monster,
    );

    let totalXp = 0;
    for (const m of monsters) {
      totalXp += m.monster?.xp ?? 0;
    }

    // DMG multiplier based on monster count
    const monsterCount = monsters.length;
    let multiplier = 1;
    if (monsterCount === 2) multiplier = 1.5;
    else if (monsterCount >= 3 && monsterCount <= 6) multiplier = 2;
    else if (monsterCount >= 7 && monsterCount <= 10) multiplier = 2.5;
    else if (monsterCount >= 11 && monsterCount <= 14) multiplier = 3;
    else if (monsterCount >= 15) multiplier = 4;

    const adjustedXp = Math.floor(totalXp * multiplier);

    const partySize = partyLevels.length;
    const avgLevel =
      partySize > 0
        ? Math.round(partyLevels.reduce((a, b) => a + b, 0) / partySize)
        : 1;

    // DMG XP thresholds per character level
    const thresholds: Record<string, number[]> = {
      easy: [
        25, 50, 75, 125, 250, 300, 350, 450, 550, 600, 800, 1000, 1100, 1250,
        1400, 1600, 2000, 2100, 2400, 2800,
      ],
      medium: [
        50, 100, 150, 250, 500, 600, 750, 900, 1100, 1200, 1600, 2000, 2200,
        2500, 2800, 3200, 3900, 4200, 4900, 5700,
      ],
      hard: [
        75, 150, 225, 375, 750, 900, 1100, 1400, 1600, 1900, 2400, 3000, 3400,
        3800, 4300, 4800, 5900, 6300, 7300, 8500,
      ],
      deadly: [
        100, 200, 400, 500, 1100, 1400, 1700, 2100, 2400, 2800, 3600, 4500,
        5100, 5700, 6400, 7200, 8800, 9500, 10900, 12700,
      ],
    };

    const getThreshold = (level: number, tier: string) =>
      thresholds[tier]?.[Math.min(level, 20) - 1] ?? 0;

    const partyEasy = partyLevels.reduce(
      (s, l) => s + getThreshold(l, "easy"),
      0,
    );
    const partyMedium = partyLevels.reduce(
      (s, l) => s + getThreshold(l, "medium"),
      0,
    );
    const partyHard = partyLevels.reduce(
      (s, l) => s + getThreshold(l, "hard"),
      0,
    );
    const partyDeadly = partyLevels.reduce(
      (s, l) => s + getThreshold(l, "deadly"),
      0,
    );

    let threshold: EncounterDifficulty["threshold"] = "trivial";
    if (adjustedXp >= partyDeadly) threshold = "deadly";
    else if (adjustedXp >= partyHard) threshold = "hard";
    else if (adjustedXp >= partyMedium) threshold = "medium";
    else if (adjustedXp >= partyEasy) threshold = "easy";

    return {
      totalMonsterXp: totalXp,
      adjustedXp,
      threshold,
      partySize,
      partyAverageLevel: avgLevel,
    };
  }

  /**
   * Spec 007: normaliza o payload raw do resolve para o shape interno.
   * Aceita shape simplificado (equal-split/per-pc) e legacy (arrays per-character).
   */
  async normalizeResolvePayload(
    rawBody: any,
    encounter: EncounterEntity,
    ownerUserId: string,
  ): Promise<NormalizedResolveDto> {
    const pcParticipants = (encounter.participants ?? []).filter(
      (p) => p.type === "pc" && p.characterId,
    );
    const pcCharacterIds = pcParticipants.map((p) => p.characterId!);

    // --- XP ---
    let xpRewards: NormalizedResolveDto["xpRewards"] = [];
    if (rawBody.xpRewards != null) {
      if (Array.isArray(rawBody.xpRewards)) {
        // Legacy shape
        for (const r of rawBody.xpRewards) {
          if (!r.characterId || typeof r.xp !== "number")
            throw new BadRequestException({
              code: "RESOLVE_INVALID_PAYLOAD",
              field: "xpRewards",
              error:
                "Each entry must have characterId (string) and xp (number)",
            });
          if (r.xp < 0)
            throw new BadRequestException({
              code: "RESOLVE_INVALID_PAYLOAD",
              field: "xpRewards",
              error: "xp must be >= 0",
            });
          xpRewards.push({ characterId: r.characterId, xp: r.xp });
        }
      } else if (
        typeof rawBody.xpRewards === "object" &&
        rawBody.xpRewards.mode
      ) {
        const { mode, value } = rawBody.xpRewards;
        if (mode === "equal-split") {
          if (typeof value !== "number" || value < 0)
            throw new BadRequestException({
              code: "RESOLVE_INVALID_PAYLOAD",
              field: "xpRewards",
              error: "equal-split mode requires value as a non-negative number",
            });
          if (pcCharacterIds.length === 0)
            throw new BadRequestException({
              code: "RESOLVE_INVALID_PAYLOAD",
              field: "xpRewards",
              error: "No PC participants to split XP among",
            });
          const perPc = Math.floor(value / pcCharacterIds.length);
          const remainder = value - perPc * pcCharacterIds.length;
          xpRewards = pcCharacterIds.map((id, i) => ({
            characterId: id,
            xp: perPc + (i === 0 ? remainder : 0),
          }));
        } else if (mode === "per-pc") {
          if (
            typeof value !== "object" ||
            Array.isArray(value) ||
            value == null
          )
            throw new BadRequestException({
              code: "RESOLVE_INVALID_PAYLOAD",
              field: "xpRewards",
              error: "per-pc mode requires value as { pcId: xpAmount }",
            });
          for (const [pcId, xp] of Object.entries(value)) {
            if (typeof xp !== "number" || xp < 0)
              throw new BadRequestException({
                code: "RESOLVE_INVALID_PAYLOAD",
                field: "xpRewards",
                error: `Invalid XP value for PC ${pcId}`,
              });
            xpRewards.push({ characterId: pcId, xp: xp });
          }
        } else {
          throw new BadRequestException({
            code: "RESOLVE_INVALID_PAYLOAD",
            field: "xpRewards",
            error: 'mode must be "equal-split" or "per-pc"',
          });
        }
      } else {
        throw new BadRequestException({
          code: "RESOLVE_INVALID_PAYLOAD",
          field: "xpRewards",
          error: "Expected array or { mode, value } object",
        });
      }
    }

    // --- Gold ---
    const goldRewards: NormalizedResolveDto["goldRewards"] = [];
    if (rawBody.goldRewards != null) {
      if (Array.isArray(rawBody.goldRewards)) {
        // Legacy shape
        for (const r of rawBody.goldRewards) {
          if (!r.characterId || typeof r.gp !== "number")
            throw new BadRequestException({
              code: "RESOLVE_INVALID_PAYLOAD",
              field: "goldRewards",
              error:
                "Each entry must have characterId (string) and gp (number)",
            });
          goldRewards.push({ characterId: r.characterId, gp: r.gp });
        }
      } else if (
        typeof rawBody.goldRewards === "object" &&
        !Array.isArray(rawBody.goldRewards)
      ) {
        // Simplified shape: { cp?, sp?, gp?, pp? } — split equally among PCs
        const { cp, sp, gp, pp } = rawBody.goldRewards;
        if (pcCharacterIds.length === 0)
          throw new BadRequestException({
            code: "RESOLVE_INVALID_PAYLOAD",
            field: "goldRewards",
            error: "No PC participants to split gold among",
          });
        for (const id of pcCharacterIds) {
          goldRewards.push({
            characterId: id,
            gp: gp != null ? Math.floor(gp / pcCharacterIds.length) : 0,
            cp: cp != null ? Math.floor(cp / pcCharacterIds.length) : undefined,
            sp: sp != null ? Math.floor(sp / pcCharacterIds.length) : undefined,
            pp: pp != null ? Math.floor(pp / pcCharacterIds.length) : undefined,
          });
        }
        // Remainder goes to first PC
        if (gp != null)
          goldRewards[0].gp +=
            gp - Math.floor(gp / pcCharacterIds.length) * pcCharacterIds.length;
      } else {
        throw new BadRequestException({
          code: "RESOLVE_INVALID_PAYLOAD",
          field: "goldRewards",
          error: "Expected array or { cp?, sp?, gp?, pp? } object",
        });
      }
    }

    // --- Items ---
    const itemRewards: NormalizedResolveDto["itemRewards"] = [];
    if (rawBody.itemRewards != null) {
      if (!Array.isArray(rawBody.itemRewards))
        throw new BadRequestException({
          code: "RESOLVE_INVALID_PAYLOAD",
          field: "itemRewards",
          error: "Expected array",
        });
      for (const r of rawBody.itemRewards) {
        if (r.equipmentId || r.magicItemId) {
          // Legacy shape
          itemRewards.push({
            characterId: r.characterId,
            equipmentId: r.equipmentId,
            magicItemId: r.magicItemId,
            quantity: r.quantity ?? 1,
          });
        } else if (r.equipmentSlug) {
          // Simplified shape — resolve slug to ID
          const equipment = await this.characterRepo.manager.findOne(
            EquipmentEntity,
            {
              where: { slug: r.equipmentSlug },
              select: ["id", "name"],
            },
          );
          if (!equipment)
            throw new BadRequestException({
              code: "RESOLVE_INVALID_PAYLOAD",
              field: "itemRewards",
              error: `Equipment slug "${r.equipmentSlug}" not found`,
            });
          itemRewards.push({
            characterId: r.pcId ?? r.characterId,
            equipmentId: equipment.id,
            quantity: r.quantity ?? 1,
          });
        } else {
          throw new BadRequestException({
            code: "RESOLVE_INVALID_PAYLOAD",
            field: "itemRewards",
            error:
              "Each item must have equipmentId, magicItemId, or equipmentSlug",
          });
        }
      }
    }

    return {
      outcome: rawBody.outcome,
      xpRewards,
      goldRewards,
      itemRewards,
      ownerUserId,
    };
  }

  /**
   * Spec 007: resolve encounter com payload normalizado e error handling melhorado.
   */
  async resolveEncounter(
    encounterId: string,
    rawBody: any,
    ownerUserId: string,
  ): Promise<{
    ok: true;
    value: {
      outcome: string;
      xpApplied: Array<{
        characterId: string;
        xp: number;
        newTotal: number;
        levelUpAvailable: boolean;
      }>;
      goldApplied: Array<{
        characterId: string;
        gp: number;
        cp?: number;
        sp?: number;
        pp?: number;
      }>;
      itemsApplied: Array<{
        characterId: string;
        itemName: string;
        quantity: number;
      }>;
      warnings: string[];
    };
    events: any[];
  }> {
    const encounter = await this.getById(encounterId);
    const dto = await this.normalizeResolvePayload(
      rawBody,
      encounter,
      ownerUserId,
    );
    const warnings: string[] = [];

    // Resolve campaign id once — usado pelo XpAwardService pra honrar
    // `campaign.xp_mode` (rules|milestone|hybrid).
    const session = await this.sessionService
      .getById(encounter.sessionId)
      .catch(() => null);
    const campaignId = session?.campaignId ?? undefined;

    // Apply XP via XpAwardService — escreve audit row em `xp_award_events`
    // e respeita xp_mode (milestone retorna awardedXp=0 mas grava audit).
    const xpApplied: Array<{
      characterId: string;
      xp: number;
      newTotal: number;
      levelUpAvailable: boolean;
    }> = [];
    for (const reward of dto.xpRewards) {
      if (reward.xp <= 0) continue;
      try {
        const effectiveOwner = await this.resolveEffectiveOwner(
          reward.characterId,
          dto.ownerUserId,
        );
        const result = await this.xpAwardService.awardXp({
          characterId: reward.characterId,
          amount: reward.xp,
          source: "combat_kill",
          reason: `Encounter ${encounterId} resolved (${dto.outcome})`,
          encounterId,
          ownerUserId: effectiveOwner,
          campaignId,
        });
        if (!result.ok) {
          warnings.push(`XP for ${reward.characterId}: ${result.error}`);
          continue;
        }
        xpApplied.push({
          characterId: reward.characterId,
          xp: result.value.awardedXp,
          newTotal: result.value.totalXp,
          levelUpAvailable: result.value.levelUpReady,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "unknown error";
        warnings.push(`XP for ${reward.characterId}: ${msg}`);
      }
    }

    // Apply Gold
    const goldApplied: Array<{
      characterId: string;
      gp: number;
      cp?: number;
      sp?: number;
      pp?: number;
    }> = [];
    for (const reward of dto.goldRewards) {
      try {
        const effectiveOwner = await this.resolveEffectiveOwner(
          reward.characterId,
          dto.ownerUserId,
        );
        await this.inventoryService.updateGold(
          effectiveOwner,
          reward.characterId,
          { gp: reward.gp, cp: reward.cp, sp: reward.sp, pp: reward.pp },
        );
        goldApplied.push(reward);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "unknown error";
        warnings.push(`Gold for ${reward.characterId}: ${msg}`);
      }
    }

    // Apply Items
    const itemsApplied: Array<{
      characterId: string;
      itemName: string;
      quantity: number;
    }> = [];
    for (const reward of dto.itemRewards) {
      try {
        const effectiveOwner = await this.resolveEffectiveOwner(
          reward.characterId,
          dto.ownerUserId,
        );
        if (reward.equipmentId) {
          const result = await this.inventoryService.addItem(
            effectiveOwner,
            reward.characterId,
            {
              equipmentId: reward.equipmentId,
              source: EquipmentSourceEnum.Loot,
              quantity: reward.quantity ?? 1,
            },
          );
          itemsApplied.push({
            characterId: reward.characterId,
            itemName: (result as any).equipment?.name ?? "Item",
            quantity: reward.quantity ?? 1,
          });
        }
        if (reward.magicItemId) {
          await this.inventoryService.addMagicItem(
            effectiveOwner,
            reward.characterId,
            { magicItemId: reward.magicItemId },
          );
          itemsApplied.push({
            characterId: reward.characterId,
            itemName: "Magic Item",
            quantity: 1,
          });
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "unknown error";
        warnings.push(`Item for ${reward.characterId}: ${msg}`);
      }
    }

    // Mark encounter as completed
    encounter.status = "completed";
    await this.encounterRepo.save(encounter);
    await this.sessionService.setActiveEncounter(encounter.sessionId, null);

    // Build outcome summary — payload estruturado pro post-combat narrative
    // (Spec 027 follow-up). Lido pelo AiProxy quando systemHint='post_combat'
    // e injetado em sceneContext.recent_events.
    const outcomeSummary = await this.buildEncounterOutcomeSummary(
      encounter,
      dto.outcome,
      xpApplied,
      goldApplied,
      itemsApplied,
    );

    // Emit events
    const events = [
      {
        event_type: "encounter_resolved",
        data: {
          name: encounter.name,
          outcome: dto.outcome,
          xpApplied,
          goldApplied,
          itemsApplied,
        },
      },
      {
        event_type: "encounter_outcome_summary",
        data: outcomeSummary,
      },
    ];
    await this.eventService.emit(encounter.sessionId, encounterId, events);

    return {
      ok: true,
      value: {
        outcome: dto.outcome,
        xpApplied,
        goldApplied,
        itemsApplied,
        warnings,
      },
      events,
    };
  }

  /**
   * Retorna o userId real dono do PC quando o caller usa `'system'` (auto-end).
   * Caller humano (DM/player) continua passando o próprio userId — o ownership
   * check downstream (`ensureCharacterOwnership`) então valida normalmente.
   *
   * Sem isso, `'system'` falharia em `ensureCharacterOwnership` e XP/gold
   * ficariam silenciosamente em `warnings[]`.
   */
  private async resolveEffectiveOwner(
    characterId: string,
    callerUserId: string,
  ): Promise<string> {
    if (callerUserId !== "system") return callerUserId;
    const character = await this.characterRepo.findOne({
      where: { id: characterId },
      select: ["id", "userId"],
    });
    if (!character?.userId) {
      throw new NotFoundException(
        `Personagem ${characterId} sem userId — não dá pra resolver owner.`,
      );
    }
    return character.userId;
  }

  /**
   * Spec 027 (M2 follow-up) — payload estruturado pra post-combat narrative.
   *
   * Resume o resultado do encounter em fatos curtos (PT-BR) que o Narrator
   * lê via scene_context.recent_events. Inclui:
   *  - outcome canônico (victory|defeat|retreat|negotiation)
   *  - lista de NPCs derrotados (nome + tipo + slug pro DM citar pelo nome)
   *  - HP final do PC (current/max/percent) pra calibrar tom narrativo
   *  - totais consolidados de XP / gold / items
   *  - summary em 1 frase como fato (não prosa)
   */
  private async buildEncounterOutcomeSummary(
    encounter: EncounterEntity,
    outcome: string,
    xpApplied: Array<{ characterId: string; xp: number }>,
    goldApplied: Array<{
      characterId: string;
      gp: number;
      cp?: number;
      sp?: number;
      pp?: number;
    }>,
    itemsApplied: Array<{
      characterId: string;
      itemName: string;
      quantity: number;
    }>,
  ): Promise<{
    outcome: string;
    defeatedNpcs: Array<{
      name: string;
      type: "monster" | "npc";
      monsterSlug?: string;
    }>;
    xpAwarded: number;
    gold: { cp: number; sp: number; gp: number; pp: number };
    items: Array<{ name: string; quantity: number }>;
    pcFinalHp:
      | { characterId: string; current: number; max: number; percent: number }
      | null;
    summary: string;
  }> {
    const participants = await this.participantRepo.find({
      where: { encounterId: encounter.id },
      relations: ["monster"],
    });

    const defeatedNpcs = participants
      .filter(
        (p) =>
          p.faction === "enemy" &&
          (p.type === "monster" || p.type === "npc") &&
          (p.isDefeated || (p.currentHp ?? 0) <= 0),
      )
      .map((p) => ({
        name: p.displayName,
        type: p.type as "monster" | "npc",
        monsterSlug: p.monster?.slug,
      }));

    const xpAwarded = xpApplied.reduce((sum, x) => sum + (x.xp ?? 0), 0);
    const gold = goldApplied.reduce(
      (acc, g) => ({
        cp: acc.cp + (g.cp ?? 0),
        sp: acc.sp + (g.sp ?? 0),
        gp: acc.gp + (g.gp ?? 0),
        pp: acc.pp + (g.pp ?? 0),
      }),
      { cp: 0, sp: 0, gp: 0, pp: 0 },
    );
    const items = itemsApplied.map((it) => ({
      name: it.itemName,
      quantity: it.quantity,
    }));

    const pcParticipant = participants.find(
      (p) => p.type === "pc" && p.characterId,
    );
    let pcFinalHp:
      | { characterId: string; current: number; max: number; percent: number }
      | null = null;
    if (pcParticipant?.characterId) {
      const current = pcParticipant.currentHp ?? 0;
      const max = pcParticipant.maxHp ?? 0;
      const percent = max > 0 ? Math.round((current / max) * 100) : 0;
      pcFinalHp = {
        characterId: pcParticipant.characterId,
        current,
        max,
        percent,
      };
    }

    const summary = this.formatOutcomeSummaryText(
      outcome,
      defeatedNpcs,
      xpAwarded,
      gold.gp,
      pcFinalHp?.percent ?? null,
      participants,
    );

    return {
      outcome,
      defeatedNpcs,
      xpAwarded,
      gold,
      items,
      pcFinalHp,
      summary,
    };
  }

  private formatOutcomeSummaryText(
    outcome: string,
    defeatedNpcs: Array<{ name: string }>,
    xpAwarded: number,
    gp: number,
    pcHpPercent: number | null,
    allParticipants: EncounterParticipantEntity[],
  ): string {
    const names = defeatedNpcs
      .slice(0, 3)
      .map((n) => n.name)
      .join(", ");
    if (outcome === "victory") {
      const hpFragment = pcHpPercent !== null ? ` PC ${pcHpPercent}%HP.` : "";
      const rewardParts: string[] = [];
      if (xpAwarded > 0) rewardParts.push(`${xpAwarded}XP`);
      if (gp > 0) rewardParts.push(`${gp}gp`);
      const rewards =
        rewardParts.length > 0 ? ` Recompensa: ${rewardParts.join(", ")}.` : "";
      return `Inimigos derrotados: ${names || "—"}.${hpFragment}${rewards}`;
    }
    if (outcome === "defeat") {
      const remaining = allParticipants
        .filter(
          (p) =>
            p.faction === "enemy" &&
            !(p.isDefeated || (p.currentHp ?? 0) <= 0),
        )
        .map((p) => p.displayName)
        .slice(0, 3)
        .join(", ");
      return `PC caiu em combate. Inimigos restantes: ${remaining || "—"}.`;
    }
    if (outcome === "retreat") {
      return "PC retirou-se. Combate inconcluso.";
    }
    return `Encontro encerrado: ${outcome}.`;
  }

  async updateMapData(
    encounterId: string,
    mapData: Partial<EncounterEntity["mapData"]>,
  ): Promise<EncounterEntity> {
    const encounter = await this.getById(encounterId);
    encounter.mapData = { ...encounter.mapData, ...mapData };
    return this.encounterRepo.save(encounter);
  }

  async updateParticipantPosition(
    participantId: string,
    x: number,
    y: number,
  ): Promise<EncounterParticipantEntity> {
    const p = await this.getParticipant(participantId);
    const encounter = await this.getById(p.encounterId);

    this.validatePositionBounds(x, y, encounter);
    await this.validatePositionNotOccupied(p.encounterId, x, y, participantId);

    p.positionX = x;
    p.positionY = y;
    return this.participantRepo.save(p);
  }

  async batchUpdatePositions(
    encounterId: string,
    positions: BatchPositionDto[],
  ): Promise<EncounterParticipantEntity[]> {
    const encounter = await this.getById(encounterId);

    // Validate all positions are in bounds
    for (const pos of positions) {
      this.validatePositionBounds(pos.x, pos.y, encounter);
    }

    // Check for duplicates within the batch itself
    const cellKeys = new Set<string>();
    for (const pos of positions) {
      const key = `${pos.x},${pos.y}`;
      if (cellKeys.has(key)) {
        throw new Error(`Posicao duplicada no batch: (${pos.x}, ${pos.y}).`);
      }
      cellKeys.add(key);
    }

    // Check against existing positioned participants not in this batch
    const batchIds = new Set(positions.map((p) => p.participantId));
    const existingParticipants = await this.participantRepo.find({
      where: { encounterId },
    });
    for (const existing of existingParticipants) {
      if (batchIds.has(existing.id)) continue;
      if (existing.isDefeated) continue;
      if (existing.positionX == null || existing.positionY == null) continue;
      const key = `${existing.positionX},${existing.positionY}`;
      if (cellKeys.has(key)) {
        throw new Error(
          `Posicao (${existing.positionX}, ${existing.positionY}) ja ocupada por ${existing.displayName}.`,
        );
      }
    }

    // Apply all positions
    const updated: EncounterParticipantEntity[] = [];
    for (const pos of positions) {
      const p = existingParticipants.find((pp) => pp.id === pos.participantId);
      if (!p) continue;
      p.positionX = pos.x;
      p.positionY = pos.y;
      updated.push(p);
    }

    return this.participantRepo.save(updated);
  }

  // --- Position Validation Helpers ---

  private validatePositionBounds(
    x: number,
    y: number,
    encounter: EncounterEntity,
  ): void {
    const gridColumns =
      encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
    const gridRows =
      encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;

    if (x < 0 || x >= gridColumns || y < 0 || y >= gridRows) {
      throw new Error(
        `Posicao (${x}, ${y}) fora dos limites do grid (${gridColumns}x${gridRows}).`,
      );
    }
  }

  private async validatePositionNotOccupied(
    encounterId: string,
    x: number,
    y: number,
    excludeParticipantId?: string,
  ): Promise<void> {
    const qb = this.participantRepo
      .createQueryBuilder("p")
      .where("p.encounter_id = :encounterId", { encounterId })
      .andWhere("p.position_x = :x", { x })
      .andWhere("p.position_y = :y", { y })
      .andWhere("p.is_defeated = false");

    if (excludeParticipantId) {
      qb.andWhere("p.id != :excludeId", { excludeId: excludeParticipantId });
    }

    const occupant = await qb.getOne();
    if (occupant) {
      throw new Error(
        `Posicao (${x}, ${y}) ja ocupada por ${occupant.displayName}.`,
      );
    }
  }

  async updateParticipantVisibility(
    participantId: string,
    visible: boolean,
  ): Promise<EncounterParticipantEntity> {
    const p = await this.getParticipant(participantId);
    p.isVisible = visible;
    return this.participantRepo.save(p);
  }

  /**
   * Spec 012 — Heroic Inspiration: player "arma" pra próximo d20 test ter
   * advantage. Requer que `character_state.inspiration=true` esteja ativo
   * (DM já concedeu). Consumo ocorre no próximo attack/save/check do
   * participant (combat.service).
   *
   * Retorna {ok, inspirationArmed, hasInspiration} pro cliente refletir.
   */
  async armInspiration(
    participantId: string,
    arm: boolean,
  ): Promise<{
    ok: boolean;
    inspirationArmed: boolean;
    hasInspiration: boolean;
    error?: string;
    code?: string;
  }> {
    const p = await this.getParticipant(participantId);
    if (p.type !== "pc" || !p.characterId) {
      return {
        ok: false,
        inspirationArmed: p.inspirationArmed,
        hasInspiration: false,
        error: "Inspiração só se aplica a PCs.",
        code: "INVALID_PARTICIPANT",
      };
    }
    const hasInspiration = await this.stateService.getInspiration(
      p.characterId,
    );
    if (arm && !hasInspiration) {
      return {
        ok: false,
        inspirationArmed: false,
        hasInspiration: false,
        error: "Personagem não possui Inspiração disponível — peça ao DM.",
        code: "NO_INSPIRATION",
      };
    }
    p.inspirationArmed = arm;
    await this.participantRepo.save(p);
    return { ok: true, inspirationArmed: arm, hasInspiration };
  }

  /**
   * Spec 012 — DM concede/remove Inspiração pra um PC. Caller (controller)
   * deve validar que authUser é DM da sessão. Retorna estado atualizado.
   */
  async grantInspiration(
    participantId: string,
    grant: boolean,
  ): Promise<{
    ok: boolean;
    hasInspiration: boolean;
    error?: string;
    code?: string;
  }> {
    const p = await this.getParticipant(participantId);
    if (p.type !== "pc" || !p.characterId) {
      return {
        ok: false,
        hasInspiration: false,
        error: "Inspiração só se aplica a PCs.",
        code: "INVALID_PARTICIPANT",
      };
    }
    const result = await this.stateService.setInspiration(p.characterId, grant);
    // Se DM remove, desarma automaticamente no encounter também.
    if (!grant && p.inspirationArmed) {
      p.inspirationArmed = false;
      await this.participantRepo.save(p);
    }
    return { ok: true, hasInspiration: result.inspiration };
  }

  async getParticipant(
    participantId: string,
  ): Promise<EncounterParticipantEntity> {
    const p = await this.participantRepo.findOne({
      where: { id: participantId },
      relations: ["monster"],
    });
    if (!p) throw new NotFoundException("Participante nao encontrado.");
    return p;
  }

  /**
   * Premissa weapons-in-hand — Sacar/Guardar arma em combate com consumo
   * de free object interaction (RAW 2024: 1× por turno). Fora do turno do
   * participant, rejeita (ação exigiria reaction/ready — não suportado aqui).
   * Se free já foi usada, rejeita com código `FREE_INTERACTION_EXHAUSTED`
   * (cliente pode oferecer consumir action em V2).
   */
  async swapHand(
    userId: string,
    encounterId: string,
    participantId: string,
    equipmentId: string,
    hand: "main" | "off" | null,
  ): Promise<{
    ok: boolean;
    freeObjectInteractionsUsed?: number;
    error?: string;
    code?: string;
  }> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) {
      return {
        ok: false,
        error: "Encontro nao encontrado.",
        code: "ENCOUNTER_NOT_FOUND",
      };
    }
    const p = await this.getParticipant(participantId);
    if (p.type !== "pc" || !p.characterId) {
      return {
        ok: false,
        error: "Apenas PCs podem sacar/guardar.",
        code: "INVALID_PARTICIPANT",
      };
    }
    const currentPid = encounter.turnOrder?.[encounter.currentTurnIndex];
    if (currentPid !== participantId) {
      return {
        ok: false,
        error: "Você só pode sacar/guardar no seu turno.",
        code: "NOT_YOUR_TURN",
      };
    }
    if ((p.freeObjectInteractionsUsed ?? 0) >= 1) {
      return {
        ok: false,
        error: "Free object interaction já usada neste turno.",
        code: "FREE_INTERACTION_EXHAUSTED",
      };
    }

    // Delega pro inventory service (aplica validações 2H+shield, dual-wield light, etc.)
    await this.inventoryService.setHand(userId, p.characterId, equipmentId, {
      hand,
    });
    p.freeObjectInteractionsUsed = (p.freeObjectInteractionsUsed ?? 0) + 1;
    await this.participantRepo.save(p);
    return {
      ok: true,
      freeObjectInteractionsUsed: p.freeObjectInteractionsUsed,
    };
  }

  /**
   * Spec 003 T062 — DM altera `controlledBy` do participante.
   * Apenas DM da sessão tem permissão (CONTROL_CHANGE_FORBIDDEN).
   * Retorna {previousMode, newMode, effectiveFrom} para o frontend decidir
   * quando a mudança vale (imediato vs próximo turno).
   */
  async updateControlMode(
    encounterId: string,
    participantId: string,
    rawMode: "pc" | "ai" | "dm" | "human",
    authUserId: string,
  ): Promise<{
    participantId: string;
    previousMode: "pc" | "ai" | "dm";
    newMode: "pc" | "ai" | "dm";
    effectiveFrom: "immediate" | "next_turn_of_participant";
  }> {
    // Spec 006: normalizar 'human' → 'pc'
    const mode: "pc" | "ai" | "dm" = rawMode === "human" ? "pc" : rawMode;
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) throw new NotFoundException("Encontro nao encontrado.");

    // Permissão: DM da sessão
    const session = await this.sessionService.getById(encounter.sessionId);
    if (!session) throw new NotFoundException("Sessao nao encontrada.");
    if (session.ownerId !== authUserId) {
      throw new ForbiddenException(
        "Apenas o DM da sessao pode alterar o controle de um participante.",
      );
    }

    const participant = await this.getParticipant(participantId);
    const prev = participant.controlledBy ?? "pc";
    const previousMode: "pc" | "ai" | "dm" =
      prev === ("human" as string) ? "pc" : prev;

    if (previousMode === mode) {
      return {
        participantId,
        previousMode,
        newMode: mode,
        effectiveFrom: "immediate",
      };
    }

    const isActiveTurn =
      encounter.turnOrder[encounter.currentTurnIndex] === participant.id;
    participant.controlledBy = mode;
    await this.participantRepo.save(participant);

    await this.eventService.emit(encounter.sessionId, encounter.id, [
      {
        event_type: "control_changed",
        actor_participant_id: participant.id,
        data: {
          previousMode,
          newMode: mode,
          actorUserId: authUserId,
        },
      },
    ]);

    return {
      participantId,
      previousMode,
      newMode: mode,
      effectiveFrom: isActiveTurn ? "next_turn_of_participant" : "immediate",
    };
  }
}
