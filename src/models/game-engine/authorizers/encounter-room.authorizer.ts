import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { CampaignPlayerEntity } from 'src/entities/campaign-player.entity';
import { parseRoomKey, RoomAuthorizer } from 'src/realtime/room-authorizer.interface';
import { CampaignService } from 'src/models/world/services/campaign.service';
import { SessionService } from '../services/session.service';

/**
 * Authorizes WS joins to `encounter:<encounterId>` rooms.
 * Allowed: the DM of the encounter's campaign, or any active CampaignPlayer
 * of that campaign. Solo sessions (no campaignId) allow only the session owner.
 */
@Injectable()
export class EncounterRoomAuthorizer implements RoomAuthorizer {
  readonly prefix = 'encounter';

  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    private readonly campaignService: CampaignService,
    private readonly sessionService: SessionService,
  ) {}

  async canJoin(userId: string, roomKey: string): Promise<boolean> {
    const parsed = parseRoomKey(roomKey);
    if (!parsed || parsed.prefix !== this.prefix) return false;
    const encounterId = parsed.id;

    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
      select: ['id', 'sessionId'],
    });
    if (!encounter) return false;

    const session = await this.sessionService
      .getById(encounter.sessionId)
      .catch(() => null);
    if (!session) return false;

    if (!session.campaignId) {
      // Solo/unaffiliated session: only the owner can watch.
      return session.ownerId === userId;
    }

    const campaign = await this.campaignService
      .getById(session.campaignId)
      .catch(() => null);
    if (!campaign) return false;
    if (campaign.dmUserId === userId) return true;

    const players: CampaignPlayerEntity[] = await this.campaignService
      .getPlayers(session.campaignId)
      .catch(() => [] as CampaignPlayerEntity[]);
    return players.some((p) => p.userId === userId && p.isActive);
  }
}
