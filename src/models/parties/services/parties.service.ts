import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, Repository } from "typeorm";
import {
  CampaignEntity,
  CampaignPartyMemberEntity,
  CampaignPlayerEntity,
  CharacterClassEntity,
  CharacterEntity,
  CharacterStateEntity,
  CompanionTemplateEntity,
  GameSessionEntity,
  LocationEntity,
  SceneEntity,
} from "src/entities";
import { CharactersService } from "src/models/characters/services/characters.service";

export interface InviteCompanionDto {
  ownerCharacterId: string;
  templateId: string;
  build: Record<string, unknown>;
  displayOrder?: number;
}

export interface PartyMemberSummary {
  name?: string;
  portraitUrl?: string | null;
  level?: number;
  classes?: string[];
  armorClass?: number;
  maxHp?: number;
  currentHp?: number;
  voiceTeaser?: string | null;
}

@Injectable()
export class PartiesService {
  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(
    @InjectRepository(CampaignPartyMemberEntity)
    private readonly partyMemberRepo: Repository<CampaignPartyMemberEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(CampaignPlayerEntity)
    private readonly playerRepo: Repository<CampaignPlayerEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CompanionTemplateEntity)
    private readonly templateRepo: Repository<CompanionTemplateEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly charStateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly charClassRepo: Repository<CharacterClassEntity>,
    private readonly charactersService: CharactersService,
  ) {}

  async list(
    slugOrCampaignId: string,
    userId: string,
    ownerCharacterId?: string,
  ): Promise<CampaignPartyMemberEntity[]> {
    const campaignId = await this.resolveCampaignId(slugOrCampaignId);
    await this.ensureMembership(campaignId, userId);

    return this.partyMemberRepo.find({
      where: {
        campaignId,
        ...(ownerCharacterId ? { ownerCharacterId } : {}),
        state: Not("dismissed"),
      },
      relations: ["companionCharacter", "template"],
      order: { state: "ASC", displayOrder: "ASC", recruitedAt: "ASC" },
    });
  }

  async invite(
    slugOrCampaignId: string,
    userId: string,
    dto: InviteCompanionDto,
  ): Promise<CampaignPartyMemberEntity> {
    const campaignId = await this.resolveCampaignId(slugOrCampaignId);
    await this.ensureMembership(campaignId, userId);

    const ownerCharacter = await this.characterRepo.findOne({
      where: { id: dto.ownerCharacterId, userId, ownerType: "pc" },
    });
    if (!ownerCharacter) throw new NotFoundException("PC dono nao encontrado.");

    const template = await this.templateRepo.findOne({
      where: { id: dto.templateId, campaignId },
    });
    if (!template) throw new NotFoundException("Template nao encontrado.");

    const build =
      this.isRecord(dto.build) && Object.keys(dto.build).length > 0
        ? dto.build
        : this.isRecord(template.suggestedBuild)
          ? template.suggestedBuild
          : {};

    const companion = await this.charactersService.createCompanion(
      template,
      build,
      ownerCharacter,
    );

    const member = this.partyMemberRepo.create({
      campaignId,
      ownerCharacterId: ownerCharacter.id,
      companionCharacterId: companion.id,
      companionTemplateId: template.id,
      state: "roster",
      displayOrder: dto.displayOrder ?? 0,
    });
    return this.partyMemberRepo.save(member);
  }

  async activate(
    slugOrCampaignId: string,
    userId: string,
    companionCharacterId: string,
  ): Promise<{
    partyMember: CampaignPartyMemberEntity;
    requiresLevelUp: boolean;
    pendingStages: number;
  }> {
    const campaignId = await this.resolveCampaignId(slugOrCampaignId);
    const member = await this.getOwnedMember(
      campaignId,
      userId,
      companionCharacterId,
    );
    if (member.state === "active") {
      const pendingStages = await this.getPendingLevelUpStages(
        companionCharacterId,
      );
      return {
        partyMember: member,
        requiresLevelUp: pendingStages > 0,
        pendingStages,
      };
    }

    await this.ensureSafeZone(campaignId);
    const activeCount = await this.partyMemberRepo.count({
      where: {
        campaignId,
        ownerCharacterId: member.ownerCharacterId,
        state: "active",
      },
    });
    if (activeCount >= 2) {
      throw new ConflictException({
        ok: false,
        code: "PARTY_FULL",
        message: "A party ja tem 2 companions ativos.",
      });
    }

    member.state = "active";
    member.lastActivatedAt = new Date();
    member.lastDeactivatedAt = null;
    const saved = await this.partyMemberRepo.save(member);
    const pendingStages = await this.getPendingLevelUpStages(companionCharacterId);
    return {
      partyMember: saved,
      requiresLevelUp: pendingStages > 0,
      pendingStages,
    };
  }

  async deactivate(
    slugOrCampaignId: string,
    userId: string,
    companionCharacterId: string,
  ): Promise<CampaignPartyMemberEntity> {
    const campaignId = await this.resolveCampaignId(slugOrCampaignId);
    const member = await this.getOwnedMember(
      campaignId,
      userId,
      companionCharacterId,
    );
    if (member.state === "roster") return member;
    await this.ensureSafeZone(campaignId);
    member.state = "roster";
    member.lastDeactivatedAt = new Date();
    return this.partyMemberRepo.save(member);
  }

  async dismiss(
    slugOrCampaignId: string,
    userId: string,
    companionCharacterId: string,
  ): Promise<CampaignPartyMemberEntity> {
    const campaignId = await this.resolveCampaignId(slugOrCampaignId);
    const member = await this.getOwnedMember(
      campaignId,
      userId,
      companionCharacterId,
    );
    member.state = "dismissed";
    member.dismissedAt = new Date();
    return this.partyMemberRepo.save(member);
  }

  async summary(
    slugOrCampaignId: string,
    userId: string,
    companionCharacterId: string,
  ): Promise<PartyMemberSummary> {
    const campaignId = await this.resolveCampaignId(slugOrCampaignId);
    const member = await this.getOwnedMember(
      campaignId,
      userId,
      companionCharacterId,
    );
    const [state, classes] = await Promise.all([
      this.charStateRepo.findOne({
        where: { character_id: companionCharacterId },
      }),
      this.charClassRepo.find({
        where: { character_id: companionCharacterId },
        relations: ["class"],
        order: { order: "ASC" },
      }),
    ]);
    const template = member.template;
    const profile = this.isRecord(template?.companionProfile)
      ? template.companionProfile
      : {};
    const phrases = Array.isArray(profile.signaturePhrases)
      ? profile.signaturePhrases
      : [];
    const voiceTeaser =
      phrases.find((phrase): phrase is string => typeof phrase === "string") ??
      null;
    return {
      name: member.companionCharacter?.name ?? template?.name,
      portraitUrl: template?.portraitUrl ?? null,
      level: classes.reduce((sum, cc) => sum + (cc.class_level ?? 0), 0),
      classes: classes.map((cc) => cc.class?.name).filter(Boolean),
      currentHp: state?.current_hp,
      maxHp: state?.current_hp,
      voiceTeaser,
    };
  }

  private async resolveCampaignId(slugOrId: string): Promise<string> {
    const candidate = (slugOrId || "").trim();
    if (!candidate) throw new NotFoundException("Campanha nao encontrada.");

    if (PartiesService.UUID_REGEX.test(candidate)) {
      const campaign = await this.campaignRepo.findOne({
        where: { id: candidate },
        select: { id: true },
      });
      if (!campaign) throw new NotFoundException("Campanha nao encontrada.");
      return campaign.id;
    }

    const campaign = await this.campaignRepo.findOne({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!campaign) throw new NotFoundException("Campanha nao encontrada.");
    return campaign.id;
  }

  private async ensureMembership(
    campaignId: string,
    userId: string,
  ): Promise<void> {
    const player = await this.playerRepo.findOne({
      where: { campaignId, userId, isActive: true },
      select: { id: true },
    });
    if (!player) throw new NotFoundException("Voce nao faz parte desta campanha.");
  }

  private async getOwnedMember(
    campaignId: string,
    userId: string,
    companionCharacterId: string,
  ): Promise<CampaignPartyMemberEntity> {
    await this.ensureMembership(campaignId, userId);
    const member = await this.partyMemberRepo.findOne({
      where: { campaignId, companionCharacterId },
      relations: ["template", "companionCharacter"],
    });
    if (!member || member.state === "dismissed") {
      throw new NotFoundException("Companion nao encontrado.");
    }
    const owner = await this.characterRepo.findOne({
      where: { id: member.ownerCharacterId, userId, ownerType: "pc" },
      select: { id: true },
    });
    if (!owner) throw new NotFoundException("Companion nao encontrado.");
    return member;
  }

  private async ensureSafeZone(campaignId: string): Promise<void> {
    const location = await this.getCurrentLocation(campaignId);
    const tags = Array.isArray(location?.tags) ? location.tags : [];
    const allowsRest = location?.properties?.allowsRest === true;
    if (!location || (!tags.includes("safe_zone") && !allowsRest)) {
      throw new ForbiddenException({
        ok: false,
        code: "ACTIVATION_REQUIRES_REST",
        message: "Troca de companions exige long rest ou safe zone.",
      });
    }
  }

  private async getCurrentLocation(
    campaignId: string,
  ): Promise<LocationEntity | null> {
    const sessions = await this.sessionRepo.find({
      where: { campaignId, status: In(["active", "paused"]) },
      order: { updatedAt: "DESC" },
    });
    for (const session of sessions) {
      const scene = await this.sceneRepo.findOne({
        where: { sessionId: session.id, isActive: true },
        relations: ["location"],
        order: { startedAt: "DESC" },
      });
      if (scene?.location) return scene.location;
      if (scene?.locationId) {
        return this.locationRepo.findOne({
          where: { id: scene.locationId, campaignId },
        });
      }
    }

    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
      select: { id: true, startingLocationId: true },
    });
    if (!campaign?.startingLocationId) return null;
    return this.locationRepo.findOne({
      where: { id: campaign.startingLocationId, campaignId },
    });
  }

  private async getPendingLevelUpStages(characterId: string): Promise<number> {
    const state = await this.charStateRepo.findOne({
      where: { character_id: characterId },
    });
    const pending = state?.pending_level_up;
    if (!this.isRecord(pending)) return 0;
    const stages = pending.stages;
    return typeof stages === "number" && Number.isFinite(stages)
      ? Math.max(0, stages)
      : 0;
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
