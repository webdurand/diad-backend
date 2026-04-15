import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  EncounterJoinRequestEntity,
  JoinRequestStatus,
} from 'src/entities/encounter-join-request.entity';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { CharacterEntity } from 'src/entities/character.entity';
import { CampaignPlayerEntity } from 'src/entities/campaign-player.entity';
import { UserEntity } from 'src/entities/user.entity';
import { CampaignService } from 'src/models/world/services/campaign.service';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { RealtimeService } from 'src/realtime/realtime.service';
import { DiceService } from './dice.service';
import { EventService } from './event.service';
import { SessionService } from './session.service';

export interface JoinRequestSummary {
  requestId: string;
  encounterId: string;
  characterId: string;
  characterName?: string;
  requestedByUserId: string;
  requestedByUserName?: string;
  status: JoinRequestStatus;
  rejectionReason?: string | null;
  createdAt: Date;
  resolvedAt?: Date | null;
}

export interface ApproveResult {
  requestId: string;
  status: 'approved';
  participantId: string;
  turnOrderPosition: number;
  initiativeRoll: number;
  initiativeTotal: number;
}

export interface RejectResult {
  requestId: string;
  status: 'rejected';
  rejectionReason?: string | null;
}

@Injectable()
export class JoinRequestService {
  private readonly logger = new Logger(JoinRequestService.name);

  constructor(
    @InjectRepository(EncounterJoinRequestEntity)
    private readonly requestRepo: Repository<EncounterJoinRequestEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly campaignService: CampaignService,
    private readonly sessionService: SessionService,
    private readonly sheetService: CharacterSheetService,
    private readonly diceService: DiceService,
    private readonly eventService: EventService,
    private readonly realtime: RealtimeService,
    private readonly dataSource: DataSource,
  ) {}

  // ----- create ------------------------------------------------------------

  async createRequest(
    encounterId: string,
    characterId: string,
    callerUserId: string,
  ): Promise<JoinRequestSummary> {
    const encounter = await this.loadEncounter(encounterId);
    if (encounter.status !== 'active') {
      throw new ConflictException({
        ok: false,
        code: 'ENCOUNTER_NOT_ACTIVE',
        error: 'So e possivel solicitar entrada em combate em andamento.',
        hint: 'Para encounter em preparing use POST /game/encounters/:id/characters.',
      });
    }

    const character = await this.loadCharacter(characterId);
    if (character.userId !== callerUserId) {
      throw new ForbiddenException({
        ok: false,
        code: 'FORBIDDEN',
        error: 'Voce nao e dono deste personagem.',
      });
    }

    const session = await this.sessionService.getById(encounter.sessionId);
    await this.assertPcCampaignMembership(character, session.campaignId ?? undefined);

    const dup = (encounter.participants ?? []).find(
      (p) => p.type === 'pc' && p.characterId === characterId,
    );
    if (dup) {
      throw new ConflictException({
        ok: false,
        code: 'CHARACTER_ALREADY_IN_ENCOUNTER',
        error: 'Este personagem ja participa deste encontro.',
      });
    }

    const existingPending = await this.requestRepo.findOne({
      where: { encounterId, characterId, status: 'pending' },
    });
    if (existingPending) {
      throw new ConflictException({
        ok: false,
        code: 'JOIN_REQUEST_ALREADY_PENDING',
        error: 'Ja existe uma solicitacao pendente para este personagem.',
        requestId: existingPending.id,
      });
    }

    const entity = this.requestRepo.create({
      encounterId,
      characterId,
      requestedByUserId: callerUserId,
      status: 'pending',
    });
    const saved = await this.requestRepo.save(entity);

    const dmUserId = await this.resolveDmUserId(session.campaignId ?? undefined);
    const requester = await this.userRepo.findOne({
      where: { id: callerUserId },
      select: ['id', 'name', 'username'],
    });

    if (dmUserId) {
      this.realtime.emitToUser(dmUserId, 'encounter:join_requested', {
        requestId: saved.id,
        encounterId,
        characterId,
        characterName: character.name,
        requestedByUserId: callerUserId,
        requestedByUserName: requester?.name ?? requester?.username ?? null,
        createdAt: saved.createdAt,
      });
    }

    await this.eventService
      .emit(encounter.sessionId, encounterId, [
        {
          event_type: 'join_requested',
          data: {
            request_id: saved.id,
            character_id: characterId,
            requested_by_user_id: callerUserId,
          },
        },
      ])
      .catch((err) =>
        this.logger.debug(
          `event record failed: ${err instanceof Error ? err.message : err}`,
        ),
      );

    return this.toSummary(saved, character.name, requester?.name ?? requester?.username ?? null);
  }

  // ----- list --------------------------------------------------------------

  async listByEncounter(
    encounterId: string,
    callerUserId: string,
    status: 'pending' | 'approved' | 'rejected' | 'all',
  ): Promise<JoinRequestSummary[]> {
    const encounter = await this.loadEncounter(encounterId);
    const session = await this.sessionService.getById(encounter.sessionId);
    await this.assertDmOrOwner(callerUserId, session);

    const whereBase = { encounterId };
    const where =
      status === 'all' ? whereBase : { ...whereBase, status };
    const requests = await this.requestRepo.find({
      where,
      order: { createdAt: 'ASC' },
    });

    const charIds = [...new Set(requests.map((r) => r.characterId))];
    const userIds = [...new Set(requests.map((r) => r.requestedByUserId))];
    const [chars, users] = await Promise.all([
      charIds.length > 0
        ? this.characterRepo.find({ where: { id: In(charIds) } })
        : Promise.resolve([] as CharacterEntity[]),
      userIds.length > 0
        ? this.userRepo.find({
            where: { id: In(userIds) },
            select: ['id', 'name', 'username'],
          })
        : Promise.resolve([] as UserEntity[]),
    ]);

    const charByid = new Map(chars.map((c) => [c.id, c]));
    const userById = new Map(users.map((u) => [u.id, u]));

    return requests.map((r) => {
      const char = charByid.get(r.characterId);
      const user = userById.get(r.requestedByUserId);
      return this.toSummary(
        r,
        char?.name,
        user?.name ?? user?.username ?? null,
      );
    });
  }

  // ----- approve -----------------------------------------------------------

  async approve(
    encounterId: string,
    requestId: string,
    callerUserId: string,
  ): Promise<ApproveResult> {
    const request = await this.loadPendingRequest(encounterId, requestId);
    const encounter = await this.loadEncounter(encounterId);
    const session = await this.sessionService.getById(encounter.sessionId);
    await this.assertDmOrOwner(callerUserId, session);

    if (encounter.status !== 'active') {
      throw new ConflictException({
        ok: false,
        code: 'ENCOUNTER_NOT_ACTIVE',
        error: 'O combate nao esta ativo.',
      });
    }

    const character = await this.loadCharacter(request.characterId);
    const dup = (encounter.participants ?? []).find(
      (p) => p.type === 'pc' && p.characterId === character.id,
    );
    if (dup) {
      throw new ConflictException({
        ok: false,
        code: 'CHARACTER_ALREADY_IN_ENCOUNTER',
        error: 'Este personagem ja participa deste encontro.',
      });
    }

    // Compute sheet and create participant.
    const sheet = await this.sheetService.computeSheet(
      character.userId,
      character.id,
    );
    const init = this.diceService.rollInitiative(sheet.initiative);
    const turnOrderPosition = Math.min(
      encounter.currentTurnIndex + 1,
      encounter.turnOrder.length,
    );

    const participant = this.participantRepo.create({
      encounterId,
      type: 'pc',
      characterId: character.id,
      displayName: sheet.name,
      initiativeModifier: sheet.initiative,
      initiativeRoll: init.roll,
      initiativeTotal: init.total,
      tempHp: 0,
      conditions: [],
      isDefeated: false,
      faction: 'ally',
    });

    // Transaction: save participant + update encounter.turnOrder + resolve request.
    // Use em.update for the encounter to avoid cascading the relations-loaded
    // `participants` array back into save (which causes unique conflicts).
    let finalTurnOrder: string[] = [];
    try {
      await this.dataSource.transaction(async (em) => {
        const savedParticipant = await em.save(participant);
        const nextTurnOrder = [...(encounter.turnOrder ?? [])];
        nextTurnOrder.splice(turnOrderPosition, 0, savedParticipant.id);
        await em.update(
          EncounterEntity,
          { id: encounterId },
          { turnOrder: nextTurnOrder },
        );
        finalTurnOrder = nextTurnOrder;

        request.status = 'approved';
        request.resolvedByUserId = callerUserId;
        request.resolvedAt = new Date();
        await em.save(request);

        participant.id = savedParticipant.id;
      });
    } catch (err) {
      this.logger.error(
        `approve failed for request=${requestId}: ${err instanceof Error ? err.message : err}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }

    // Emit WS events.
    this.realtime.emitToRoom(`encounter:${encounterId}`, 'encounter:participant_added', {
      encounterId,
      participant: {
        id: participant.id,
        type: 'pc',
        characterId: character.id,
        displayName: sheet.name,
        currentHp: sheet.currentHp,
        maxHp: sheet.maxHp,
        armorClass: sheet.armorClass,
        initiativeModifier: sheet.initiative,
        initiativeRoll: init.roll,
        initiativeTotal: init.total,
        faction: 'ally',
      },
      turnOrder: finalTurnOrder,
    });
    this.realtime.emitToUser(
      request.requestedByUserId,
      'encounter:join_approved',
      {
        requestId,
        encounterId,
        participantId: participant.id,
        turnOrderPosition,
        initiativeTotal: init.total,
      },
    );

    await this.eventService
      .emit(encounter.sessionId, encounterId, [
        {
          event_type: 'participant_joined',
          actor_participant_id: participant.id,
          data: {
            request_id: requestId,
            character_id: character.id,
            initiative_total: init.total,
          },
        },
      ])
      .catch(() => undefined);

    return {
      requestId,
      status: 'approved',
      participantId: participant.id,
      turnOrderPosition,
      initiativeRoll: init.roll,
      initiativeTotal: init.total,
    };
  }

  // ----- reject ------------------------------------------------------------

  async reject(
    encounterId: string,
    requestId: string,
    callerUserId: string,
    reason?: string,
  ): Promise<RejectResult> {
    const request = await this.loadPendingRequest(encounterId, requestId);
    const encounter = await this.loadEncounter(encounterId);
    const session = await this.sessionService.getById(encounter.sessionId);
    await this.assertDmOrOwner(callerUserId, session);

    request.status = 'rejected';
    request.rejectionReason = reason ?? null;
    request.resolvedByUserId = callerUserId;
    request.resolvedAt = new Date();
    await this.requestRepo.save(request);

    this.realtime.emitToUser(
      request.requestedByUserId,
      'encounter:join_rejected',
      {
        requestId,
        encounterId,
        reason: reason ?? null,
      },
    );

    return {
      requestId,
      status: 'rejected',
      rejectionReason: reason ?? null,
    };
  }

  // ----- auto-reject pending requests when encounter completes -------------

  async autoRejectPendingOnEncounterEnd(encounterId: string): Promise<number> {
    const pending = await this.requestRepo.find({
      where: { encounterId, status: 'pending' },
    });
    if (pending.length === 0) return 0;
    const now = new Date();
    for (const r of pending) {
      r.status = 'rejected';
      r.rejectionReason = 'encounter_ended';
      r.resolvedAt = now;
    }
    await this.requestRepo.save(pending);
    for (const r of pending) {
      this.realtime.emitToUser(r.requestedByUserId, 'encounter:join_rejected', {
        requestId: r.id,
        encounterId,
        reason: 'encounter_ended',
      });
    }
    return pending.length;
  }

  // ----- helpers -----------------------------------------------------------

  private async loadEncounter(encounterId: string): Promise<EncounterEntity> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
      relations: ['participants'],
    });
    if (!encounter) {
      throw new NotFoundException({
        ok: false,
        code: 'ENCOUNTER_NOT_FOUND',
        error: 'Encontro nao encontrado.',
      });
    }
    return encounter;
  }

  private async loadCharacter(characterId: string): Promise<CharacterEntity> {
    const character = await this.characterRepo.findOne({
      where: { id: characterId },
    });
    if (!character) {
      throw new NotFoundException({
        ok: false,
        code: 'CHARACTER_NOT_FOUND',
        error: 'Personagem nao encontrado.',
      });
    }
    return character;
  }

  private async loadPendingRequest(
    encounterId: string,
    requestId: string,
  ): Promise<EncounterJoinRequestEntity> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId, encounterId },
    });
    if (!request) {
      throw new NotFoundException({
        ok: false,
        code: 'JOIN_REQUEST_NOT_FOUND',
        error: 'Solicitacao nao encontrada.',
      });
    }
    if (request.status !== 'pending') {
      throw new ConflictException({
        ok: false,
        code: 'JOIN_REQUEST_ALREADY_RESOLVED',
        error: 'Esta solicitacao ja foi resolvida.',
        currentStatus: request.status,
      });
    }
    return request;
  }

  private async assertPcCampaignMembership(
    character: CharacterEntity,
    campaignId: string | undefined,
  ): Promise<void> {
    if (!campaignId) return; // solo session: owner check already enforced
    const players = await this.campaignService
      .getPlayers(campaignId)
      .catch(() => [] as CampaignPlayerEntity[]);
    const match = players.find(
      (p) => p.userId === character.userId && p.isActive,
    );
    if (!match) {
      throw new ForbiddenException({
        ok: false,
        code: 'FORBIDDEN_CAMPAIGN_MEMBER',
        error: 'O personagem nao pertence a um jogador ativo da campanha.',
      });
    }
  }

  private async assertDmOrOwner(
    callerUserId: string,
    session: { ownerId: string; campaignId?: string | null },
  ): Promise<void> {
    if (session.ownerId === callerUserId) return;
    if (session.campaignId) {
      const campaign = await this.campaignService
        .getById(session.campaignId)
        .catch(() => null);
      if (campaign && campaign.dmUserId === callerUserId) return;
    }
    throw new ForbiddenException({
      ok: false,
      code: 'FORBIDDEN',
      error: 'Apenas o DM da campanha pode gerenciar solicitacoes.',
    });
  }

  private async resolveDmUserId(
    campaignId: string | undefined,
  ): Promise<string | null> {
    if (!campaignId) return null;
    const campaign = await this.campaignService
      .getById(campaignId)
      .catch(() => null);
    return campaign?.dmUserId ?? null;
  }

  private toSummary(
    r: EncounterJoinRequestEntity,
    characterName?: string,
    requestedByUserName?: string | null,
  ): JoinRequestSummary {
    return {
      requestId: r.id,
      encounterId: r.encounterId,
      characterId: r.characterId,
      characterName,
      requestedByUserId: r.requestedByUserId,
      requestedByUserName: requestedByUserName ?? undefined,
      status: r.status,
      rejectionReason: r.rejectionReason ?? null,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt ?? null,
    };
  }
}
