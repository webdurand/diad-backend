import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LocationEntity } from "src/entities/location.entity";
import { SceneEntity } from "src/entities/scene.entity";
import { AuthGuard } from "src/models/auth/auth.guard";
import { CampaignIdPipe } from "src/models/world/pipes/campaign-id.pipe";
import {
  Difficulty,
  LocationType,
  MonsterSelectorService,
} from "../services/monster-selector.service";
import { RandomEncounterMaterializerService } from "../services/random-encounter-materializer.service";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

interface AuthRequest extends Request {
  user?: { id: string };
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException("Usuário não autenticado.");
  return id;
}

function extractTraceId(traceparent?: string): string | undefined {
  if (!traceparent) return undefined;
  const parts = traceparent.split("-");
  if (parts.length < 4) return undefined;
  const traceId = parts[1];
  return /^[0-9a-f]{32}$/.test(traceId) ? traceId : undefined;
}

interface PreviewBody {
  sessionId: string;
  sceneId?: string;
  locationId?: string;
  partyAvgLevel: number;
  partySize: number;
  targetDifficulty: Difficulty;
  recentAnchors?: string[];
  creatureTypeHint?: string | null;
  narrativeTags?: string[];
}

interface MaterializeBody {
  sessionId: string;
  sceneId?: string;
  monsterSlugs: string[];
  partyAvgLevel: number;
  partySize?: number;
  difficulty: Difficulty;
  biome?: string;
  reasonChain?: string[];
}

const ELIGIBLE_TYPES: ReadonlyArray<LocationType> = [
  "wilderness",
  "dungeon",
  "dungeon_room",
];

@Controller("campaigns")
@UseGuards(AuthGuard)
export class RandomEncounterController {
  private readonly logger = new Logger(RandomEncounterController.name);

  constructor(
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    private readonly selector: MonsterSelectorService,
    private readonly materializer: RandomEncounterMaterializerService,
  ) {}

  private async resolveLocation(
    campaignId: string,
    sceneId?: string,
    locationId?: string,
  ): Promise<LocationEntity | null> {
    if (locationId) {
      return this.locationRepo.findOne({
        where: { id: locationId, campaignId },
      });
    }
    if (sceneId) {
      const scene = await this.sceneRepo.findOne({
        where: { id: sceneId },
        select: ["id", "locationId"],
      });
      if (scene?.locationId) {
        return this.locationRepo.findOne({
          where: { id: scene.locationId, campaignId },
        });
      }
    }
    return null;
  }

  @Post(":id/random-encounter/preview")
  @HttpCode(HttpStatus.OK)
  async preview(
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: PreviewBody,
  ) {
    this.logger.log(
      `🎲 PREVIEW received campaignId=${campaignId} sessionId=${body.sessionId} ` +
        `sceneId=${body.sceneId ?? "n/a"} locationId=${body.locationId ?? "n/a"} ` +
        `partyAvgLevel=${body.partyAvgLevel} partySize=${body.partySize} ` +
        `targetDifficulty=${body.targetDifficulty}`,
    );

    const location = await this.resolveLocation(
      campaignId,
      body.sceneId,
      body.locationId,
    );

    let locationType: LocationType = "wilderness";
    let biomeTags: string[] | undefined;

    if (location) {
      this.logger.log(
        `🎲 PREVIEW location resolved: id=${location.id} name="${location.name}" ` +
          `type=${location.type} tags=${JSON.stringify(location.tags ?? [])}`,
      );
      if (!ELIGIBLE_TYPES.includes(location.type as LocationType)) {
        this.logger.warn(
          `🎲 PREVIEW INVALID location type=${location.type} (precisa wilderness/dungeon/dungeon_room)`,
        );
        throw new DomainException(
          ErrorCode.RANDOM_ENCOUNTER_INVALID_LOCATION,
          `Tipo '${location.type}' não suporta random encounter.`,
        );
      }
      locationType = location.type as LocationType;
      biomeTags = Array.isArray(location.tags) ? location.tags : undefined;
    } else {
      this.logger.warn(
        `🎲 PREVIEW location NOT RESOLVED — defaulting type=wilderness sem biome filter`,
      );
    }

    const composition = await this.selector.selectComposition({
      partyAvgLevel: body.partyAvgLevel,
      partySize: body.partySize,
      biomeTags,
      locationType,
      targetDifficulty: body.targetDifficulty,
      recentAnchors: body.recentAnchors,
      creatureTypeHint: body.creatureTypeHint ?? null,
      narrativeTags: body.narrativeTags,
    });

    if (!composition) {
      this.logger.warn(
        `🎲 PREVIEW POOL EMPTY locationType=${locationType} biomeTags=${JSON.stringify(biomeTags ?? [])} ` +
          `partyAvgLevel=${body.partyAvgLevel} difficulty=${body.targetDifficulty}`,
      );
      throw new DomainException(
        ErrorCode.RANDOM_ENCOUNTER_POOL_EMPTY,
        "Nenhum monstro elegível encontrado pro encontro aleatório.",
        {
          context: {
            campaignId,
            locationType,
            biomeTags,
            partyAvgLevel: body.partyAvgLevel,
          },
        },
      );
    }

    this.logger.log(
      `🎲 PREVIEW composition: anchor=${composition.anchor} mode=${composition.mode} ` +
        `slugs=${JSON.stringify(composition.monsterSlugs)} adjustedXp=${composition.adjustedXp}`,
    );

    return {
      monsterSlugs: composition.monsterSlugs,
      displayNames: composition.displayNames,
      anchor: composition.anchor,
      mode: composition.mode,
      adjustedXp: composition.adjustedXp,
      reasonChain: composition.reasonChain,
      biome: biomeTags?.[0] ?? null,
      difficulty: body.targetDifficulty,
      locationType,
    };
  }

  @Post(":id/random-encounter")
  @HttpCode(HttpStatus.CREATED)
  async materialize(
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: MaterializeBody,
    @Req() req: AuthRequest,
    @Headers("traceparent") traceparent?: string,
  ) {
    const ownerUserId = getUserId(req);
    const traceId = extractTraceId(traceparent);

    this.logger.log(
      `🎲 MATERIALIZE received campaignId=${campaignId} sessionId=${body.sessionId} ` +
        `slugs=${JSON.stringify(body.monsterSlugs)} difficulty=${body.difficulty}`,
    );

    const result = await this.materializer.materialize({
      campaignId,
      sessionId: body.sessionId,
      sceneId: body.sceneId,
      monsterSlugs: body.monsterSlugs,
      ownerUserId,
      partyAvgLevel: body.partyAvgLevel,
      partySize: body.partySize,
      difficulty: body.difficulty,
      biome: body.biome,
      reasonChain: body.reasonChain,
      traceId,
    });

    this.logger.log(
      `🎲 MATERIALIZE encounterId=${result.encounterId} npcIds=${JSON.stringify(result.npcIds)} ` +
        `participants=${result.participantIds.length}`,
    );

    return result;
  }
}
